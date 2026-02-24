package stream

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	anacrolixlog "github.com/anacrolix/log"
	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/storage"
)

type TorrentStreamer struct {
	client  *torrent.Client
	mu      sync.RWMutex
	streams map[string]*TorrentStream
	dataDir string
}

type TorrentStream struct {
	t        *torrent.Torrent
	file     *torrent.File
	filePath string
	fileIdx  *int

	readyOnce sync.Once
	readyCh   chan struct{}
	readyErr  error
}

type TorrentStatus struct {
	Stage           string  `json:"stage"`
	Ready           bool    `json:"ready"`
	Error           string  `json:"error,omitempty"`
	Peers           int     `json:"peers,omitempty"`
	PiecesComplete  int     `json:"piecesComplete,omitempty"`
	PiecesTotal     int     `json:"piecesTotal,omitempty"`
	Progress        float64 `json:"progress,omitempty"`
	DownUsefulBytes int64   `json:"downUsefulBytes,omitempty"`
}

func (ts *TorrentStream) status() TorrentStatus {
	st := TorrentStatus{}
	if ts == nil || ts.t == nil {
		st.Stage = "missing"
		st.Error = "torrent is nil"
		return st
	}

	readyDone := false
	select {
	case <-ts.readyCh:
		readyDone = true
	default:
	}

	infoReady := false
	select {
	case <-ts.t.GotInfo():
		infoReady = true
	default:
	}

	if readyDone {
		if ts.readyErr != nil {
			st.Stage = "error"
			st.Error = ts.readyErr.Error()
			return st
		}
		st.Ready = ts.file != nil
		st.Stage = "ready"
	} else if !infoReady {
		st.Stage = "metadata"
	} else {
		st.Stage = "downloading"
	}

	stats := ts.t.Stats()
	st.Peers = stats.ActivePeers
	st.PiecesComplete = stats.PiecesComplete
	st.PiecesTotal = ts.t.NumPieces()
	if st.PiecesTotal > 0 {
		st.Progress = float64(st.PiecesComplete) / float64(st.PiecesTotal)
	}
	st.DownUsefulBytes = stats.BytesReadUsefulData.Int64()

	return st
}

func newTorrentStream(t *torrent.Torrent, fileIdx *int) *TorrentStream {
	return &TorrentStream{
		t:       t,
		fileIdx: fileIdx,
		readyCh: make(chan struct{}),
	}
}

func (ts *TorrentStream) ensureReady() error {
	ts.readyOnce.Do(func() {
		ts.readyErr = ts.prepare()
		close(ts.readyCh)
	})
	<-ts.readyCh
	return ts.readyErr
}

func (ts *TorrentStream) prepare() error {
	if ts.t == nil {
		return errors.New("torrent is nil")
	}

	log.Printf("Torrent %s: waiting for metadata...", ts.t.InfoHash().HexString())
	select {
	case <-ts.t.GotInfo():
		// ok
	case <-time.After(20 * time.Second):
		return fmt.Errorf("timeout waiting for torrent metadata")
	}

	log.Printf("Got info for torrent %s: %q, length=%d bytes",
		ts.t.InfoHash().HexString(), ts.t.Name(), ts.t.Length())

	files := ts.t.Files()
	if len(files) == 0 {
		return fmt.Errorf("no files found in torrent")
	}
	log.Printf("files:")
	for i, f := range files {
		log.Printf("  [%d] %q (%d bytes)", i, f.Path(), f.Length())
	}

	// Pick target file
	var targetFile *torrent.File
	if ts.fileIdx != nil && *ts.fileIdx >= 0 && *ts.fileIdx < len(files) {
		targetFile = files[*ts.fileIdx]
		log.Printf("Using specified file index %d: %q", *ts.fileIdx, targetFile.Path())
	} else {
		// Default: pick the largest file (usually the main video)
		var maxSize int64
		for _, f := range files {
			if f.Length() > maxSize {
				maxSize = f.Length()
				targetFile = f
			}
		}
		log.Printf("No file index specified, selected largest file: %q", targetFile.Path())
	}
	if targetFile == nil {
		return fmt.Errorf("failed to select target file")
	}

	// Disable download for all other files so we don't fill disk with the whole torrent
	for _, f := range files {
		if f != targetFile {
			f.SetPriority(torrent.PiecePriorityNone)
		}
	}

	// Enable download only for this file
	targetFile.Download()

	pl := int64(ts.t.Info().PieceLength)
	if pl <= 0 {
		return fmt.Errorf("invalid piece length: %d", pl)
	}

	startPiece := int(targetFile.Offset() / pl)
	endPiece := int((targetFile.Offset() + 10*1024*1024) / pl)
	if startPiece < 0 || startPiece >= ts.t.NumPieces() {
		return fmt.Errorf("startPiece %d out of range (numPieces=%d)", startPiece, ts.t.NumPieces())
	}
	if endPiece >= ts.t.NumPieces() {
		endPiece = ts.t.NumPieces() - 1
	}

	log.Printf("Streaming file %q (%d bytes), startPiece=%d endPiece=%d pieceLen=%d",
		targetFile.Path(), targetFile.Length(), startPiece, endPiece, pl)

	// Aggressively prioritize the first ~10MB for fast start
	for i := startPiece; i <= endPiece; i++ {
		p := ts.t.Piece(i)
		p.SetPriority(torrent.PiecePriorityNow)
	}

	if targetFile.Length() > 0 {
		tailBytes := int64(64 * 1024 * 1024)
		if targetFile.Length() < tailBytes {
			tailBytes = targetFile.Length()
		}
		tailOffset := targetFile.Offset() + targetFile.Length() - tailBytes
		tailStartPiece := int(tailOffset / pl)
		tailEndPiece := int((targetFile.Offset() + targetFile.Length() - 1) / pl)
		if tailStartPiece < 0 {
			tailStartPiece = 0
		}
		if tailEndPiece >= ts.t.NumPieces() {
			tailEndPiece = ts.t.NumPieces() - 1
		}
		for i := tailStartPiece; i <= tailEndPiece; i++ {
			p := ts.t.Piece(i)
			p.SetPriority(torrent.PiecePriorityNow)
		}
		log.Printf("Prioritized tail pieces for metadata: %d-%d", tailStartPiece, tailEndPiece)
	}

	// Stats logger
	go func(infoHash string) {
		for range time.Tick(5 * time.Second) {
			st := ts.t.Stats()
			log.Printf("Torrent %s: peers=%d, have=%d/%d, downUseful=%dB, up=%dB",
				infoHash,
				st.ActivePeers,
				st.PiecesComplete,
				ts.t.NumPieces(),
				st.BytesReadUsefulData.Int64(),
				st.BytesWrittenData.Int64(),
			)
		}
	}(ts.t.InfoHash().HexString())

	// Best-effort short wait for the first piece, but don't block forever
	log.Printf("Waiting for first piece of torrent %s (piece %d)...",
		ts.t.InfoHash().HexString(), startPiece)
	deadline := time.Now().Add(15 * time.Second)
	for {
		if ts.t.Piece(startPiece).State().Complete {
			log.Printf("First piece ready, streaming can start")
			break
		}
		if time.Now().After(deadline) {
			log.Printf("Timeout waiting for first piece, proceeding anyway")
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	ts.file = targetFile
	ts.filePath = targetFile.Path()
	return nil
}

func NewTorrentStreamer(dataDir string) *TorrentStreamer {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatalf("failed to create torrent data dir: %v", err)
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dataDir

	pc, err := storage.NewDefaultPieceCompletionForDir(dataDir)
	if err != nil {
		log.Fatalf("piece completion init failed: %v", err)
	}
	cfg.DefaultStorage = storage.NewFileWithCompletion(dataDir, pc)

	cfg.NoUpload = false
	cfg.Debug = false
	cfg.DisableTCP = false
	cfg.DisableUTP = false
	cfg.DisableIPv6 = false
	cfg.NoDHT = false
	cfg.DisableIPv4 = false

	cfg.Logger = anacrolixlog.NewLogger("torrent")

	c, err := torrent.NewClient(cfg)
	if err != nil {
		log.Fatalf("error creating torrent client: %s", err)
	}

	return &TorrentStreamer{
		client:  c,
		streams: make(map[string]*TorrentStream),
		dataDir: dataDir,
	}
}

func (s *TorrentStreamer) AddTorrent(magnetOrInfoHash string, fileIdx *int) (string, string, error) {
	var (
		t   *torrent.Torrent
		err error
	)

	if strings.HasPrefix(magnetOrInfoHash, "magnet:") {
		t, err = s.client.AddMagnet(magnetOrInfoHash)
	} else {
		t, err = s.client.AddMagnet(fmt.Sprintf("magnet:?xt=urn:btih:%s", magnetOrInfoHash))
	}
	if err != nil {
		return "", "", fmt.Errorf("failed to add torrent: %w", err)
	}

	infoHash := t.InfoHash().HexString()

	// Store stream immediately so session creation doesn't block on metadata.
	stream := newTorrentStream(t, fileIdx)
	s.mu.Lock()
	s.streams[infoHash] = stream
	s.mu.Unlock()

	// Kick off metadata + file selection in the background.
	go func() {
		if err := stream.ensureReady(); err != nil {
			log.Printf("Torrent %s: prepare failed: %v", infoHash, err)
		}
	}()

	return fmt.Sprintf("http://127.0.0.1:6969/torrents/%s", infoHash), infoHash, nil
}

func (s *TorrentStreamer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Path: /torrents/{infohash}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/torrents/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	infoHash := parts[0]

	s.mu.RLock()
	stream, ok := s.streams[infoHash]
	s.mu.RUnlock()
	if !ok || stream == nil {
		http.NotFound(w, r)
		return
	}

	if len(parts) >= 2 && parts[1] == "status" {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(stream.status())
		return
	}

	if err := stream.ensureReady(); err != nil {
		http.Error(w, fmt.Sprintf("torrent not ready: %v", err), http.StatusGatewayTimeout)
		return
	}
	if stream.file == nil {
		http.Error(w, "torrent has no selected file", http.StatusInternalServerError)
		return
	}

	tr := stream.file.NewReader()
	defer tr.Close()

	tr.SetResponsive()
	if r.URL.Query().Get("metadata") == "1" {
		tr.SetReadahead(256 * 1024 * 1024)
	} else {
		tr.SetReadahead(16 * 1024 * 1024)
	}
	name := filepath.Base(stream.filePath)

	http.ServeContent(w, r, name, time.Now(), tr)
}

func (s *TorrentStreamer) RemoveTorrent(infoHash string) {
	s.mu.Lock()
	stream, ok := s.streams[infoHash]
	if ok {
		delete(s.streams, infoHash)
	}
	s.mu.Unlock()

	if ok && stream != nil && stream.t != nil {
		log.Printf("Dropping torrent %s", infoHash)
		stream.t.Drop()
	}
}

func (s *TorrentStreamer) Close() {
	s.client.Close()
}
