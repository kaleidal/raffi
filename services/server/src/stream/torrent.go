package stream

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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
	enabled bool
}

var ErrTorrentingDisabled = errors.New("torrenting is disabled")

type TorrentStream struct {
	t *torrent.Torrent

	refCount int
	// fileRefs tracks how many sessions want each file index (-1 = default/largest).
	fileRefs map[int]int

	startupStartPiece int
	startupEndPiece   int

	infoOnce sync.Once
	infoCh   chan struct{}
	infoErr  error

	stopCh   chan struct{}
	stopOnce sync.Once
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

func fileRefKey(fileIdx *int) int {
	if fileIdx == nil {
		return -1
	}
	return *fileIdx
}

func torrentServeURL(infoHash string, fileIdx *int) string {
	base := fmt.Sprintf("http://127.0.0.1:6969/torrents/%s", infoHash)
	if fileIdx != nil {
		return fmt.Sprintf("%s?fileIdx=%d", base, *fileIdx)
	}
	return base
}

func parseFileIdxQuery(r *http.Request) *int {
	raw := r.URL.Query().Get("fileIdx")
	if raw == "" {
		return nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return nil
	}
	return &n
}

func (ts *TorrentStream) status() TorrentStatus {
	st := TorrentStatus{}
	if ts == nil || ts.t == nil {
		st.Stage = "missing"
		st.Error = "torrent is nil"
		return st
	}

	infoDone := false
	select {
	case <-ts.infoCh:
		infoDone = true
	default:
	}

	infoReady := false
	select {
	case <-ts.t.GotInfo():
		infoReady = true
	default:
	}

	if infoDone {
		if ts.infoErr != nil {
			st.Stage = "error"
			st.Error = ts.infoErr.Error()
			return st
		}
		st.Ready = infoReady
		st.Stage = "ready"
	} else if !infoReady {
		st.Stage = "metadata"
	} else {
		st.Stage = "downloading"
	}

	stats := ts.t.Stats()
	st.Peers = stats.ActivePeers
	st.PiecesComplete = stats.PiecesComplete

	func() {
		defer func() {
			if recover() != nil {
				st.PiecesTotal = 0
			}
		}()

		if !infoReady {
			st.PiecesTotal = 0
			return
		}

		if ts.t.Info() == nil {
			st.PiecesTotal = 0
			return
		}

		if ts.startupStartPiece >= 0 &&
			ts.startupEndPiece >= ts.startupStartPiece &&
			ts.startupEndPiece < ts.t.NumPieces() {
			requiredTotal := ts.startupEndPiece - ts.startupStartPiece + 1
			requiredComplete := 0
			for i := ts.startupStartPiece; i <= ts.startupEndPiece; i++ {
				if ts.t.Piece(i).State().Complete {
					requiredComplete++
				}
			}
			st.PiecesComplete = requiredComplete
			st.PiecesTotal = requiredTotal
			return
		}

		st.PiecesTotal = ts.t.NumPieces()
	}()

	if st.PiecesTotal > 0 {
		st.Progress = float64(st.PiecesComplete) / float64(st.PiecesTotal)
	}
	st.DownUsefulBytes = stats.BytesReadUsefulData.Int64()

	return st
}

func newTorrentStream(t *torrent.Torrent, fileIdx *int) *TorrentStream {
	ts := &TorrentStream{
		t:                 t,
		refCount:          1,
		fileRefs:          map[int]int{fileRefKey(fileIdx): 1},
		startupStartPiece: -1,
		startupEndPiece:   -1,
		infoCh:            make(chan struct{}),
		stopCh:            make(chan struct{}),
	}
	return ts
}

func (ts *TorrentStream) addFileInterest(fileIdx *int) {
	if ts.fileRefs == nil {
		ts.fileRefs = make(map[int]int)
	}
	ts.fileRefs[fileRefKey(fileIdx)]++
}

func (ts *TorrentStream) removeFileInterest(fileIdx *int) {
	if ts.fileRefs == nil {
		return
	}
	key := fileRefKey(fileIdx)
	if ts.fileRefs[key] <= 1 {
		delete(ts.fileRefs, key)
		return
	}
	ts.fileRefs[key]--
}

func (ts *TorrentStream) stop() {
	if ts == nil {
		return
	}
	ts.stopOnce.Do(func() {
		close(ts.stopCh)
	})
}

func (ts *TorrentStream) ensureInfo() error {
	ts.infoOnce.Do(func() {
		ts.infoErr = ts.waitForInfo()
		close(ts.infoCh)
	})
	<-ts.infoCh
	return ts.infoErr
}

func (ts *TorrentStream) waitForInfo() error {
	if ts.t == nil {
		return errors.New("torrent is nil")
	}

	log.Printf("Torrent %s: waiting for metadata...", ts.t.InfoHash().HexString())
	select {
	case <-ts.t.GotInfo():
	case <-ts.stopCh:
		return errors.New("torrent stream canceled")
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

	go func(infoHash string) {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ts.stopCh:
				return
			case <-ticker.C:
			}
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

	return nil
}

func pickTorrentFile(files []*torrent.File, fileIdx *int) (*torrent.File, error) {
	if len(files) == 0 {
		return nil, fmt.Errorf("no files found in torrent")
	}
	if fileIdx != nil && *fileIdx >= 0 && *fileIdx < len(files) {
		return files[*fileIdx], nil
	}
	var targetFile *torrent.File
	var maxSize int64
	for _, f := range files {
		if f.Length() > maxSize {
			maxSize = f.Length()
			targetFile = f
		}
	}
	if targetFile == nil {
		return nil, fmt.Errorf("failed to select target file")
	}
	return targetFile, nil
}

func (ts *TorrentStream) openFile(fileIdx *int) (*torrent.File, string, error) {
	if err := ts.ensureInfo(); err != nil {
		return nil, "", err
	}

	files := ts.t.Files()
	targetFile, err := pickTorrentFile(files, fileIdx)
	if err != nil {
		return nil, "", err
	}

	if fileIdx != nil && *fileIdx >= 0 && *fileIdx < len(files) {
		log.Printf("Using specified file index %d: %q", *fileIdx, targetFile.Path())
	} else {
		log.Printf("No file index specified, selected largest file: %q", targetFile.Path())
	}

	interested := make(map[*torrent.File]struct{})
	interested[targetFile] = struct{}{}
	for key := range ts.fileRefs {
		var idx *int
		if key >= 0 {
			v := key
			idx = &v
		}
		f, pickErr := pickTorrentFile(files, idx)
		if pickErr == nil && f != nil {
			interested[f] = struct{}{}
		}
	}

	for _, f := range files {
		if _, ok := interested[f]; ok {
			f.Download()
		} else {
			f.SetPriority(torrent.PiecePriorityNone)
		}
	}

	pl := int64(ts.t.Info().PieceLength)
	if pl <= 0 {
		return nil, "", fmt.Errorf("invalid piece length: %d", pl)
	}

	startPiece := int(targetFile.Offset() / pl)
	endPiece := int((targetFile.Offset() + 10*1024*1024) / pl)
	if startPiece < 0 || startPiece >= ts.t.NumPieces() {
		return nil, "", fmt.Errorf("startPiece %d out of range (numPieces=%d)", startPiece, ts.t.NumPieces())
	}
	if endPiece >= ts.t.NumPieces() {
		endPiece = ts.t.NumPieces() - 1
	}

	log.Printf("Streaming file %q (%d bytes), startPiece=%d endPiece=%d pieceLen=%d",
		targetFile.Path(), targetFile.Length(), startPiece, endPiece, pl)

	ts.startupStartPiece = startPiece
	ts.startupEndPiece = endPiece

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

	log.Printf("Waiting for first piece of torrent %s (piece %d)...",
		ts.t.InfoHash().HexString(), startPiece)
	for {
		select {
		case <-ts.stopCh:
			return nil, "", errors.New("torrent stream canceled")
		default:
		}

		if ts.t.Piece(startPiece).State().Complete {
			log.Printf("First piece ready, streaming can start")
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	return targetFile, targetFile.Path(), nil
}

func NewTorrentStreamer(dataDir string) *TorrentStreamer {
	return &TorrentStreamer{
		streams: make(map[string]*TorrentStream),
		dataDir: dataDir,
	}
}

func (s *TorrentStreamer) Enable() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.enabled && s.client != nil {
		return nil
	}

	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create torrent data dir: %w", err)
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = s.dataDir

	pc, err := storage.NewDefaultPieceCompletionForDir(s.dataDir)
	if err != nil {
		return fmt.Errorf("piece completion init failed: %w", err)
	}
	cfg.DefaultStorage = storage.NewFileWithCompletion(s.dataDir, pc)

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
		return fmt.Errorf("error creating torrent client: %w", err)
	}

	s.client = c
	s.enabled = true
	log.Printf("Torrenting enabled")
	return nil
}

func (s *TorrentStreamer) Disable() {
	s.mu.Lock()
	defer s.mu.Unlock()
	client := s.client
	streams := s.streams
	s.client = nil
	s.enabled = false
	s.streams = make(map[string]*TorrentStream)

	for infoHash, torrentStream := range streams {
		if torrentStream == nil {
			continue
		}
		torrentStream.stop()
		if torrentStream.t != nil {
			log.Printf("Dropping torrent %s", infoHash)
			torrentStream.t.Drop()
		}
	}
	if client != nil {
		client.Close()
	}
	if err := os.RemoveAll(s.dataDir); err != nil {
		log.Printf("Warning: failed to remove torrent data while disabling: %v", err)
	}
	log.Printf("Torrenting disabled")
}

func (s *TorrentStreamer) IsEnabled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.enabled && s.client != nil
}

func (s *TorrentStreamer) AddTorrent(magnetOrInfoHash string, fileIdx *int) (string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.enabled || s.client == nil {
		return "", "", ErrTorrentingDisabled
	}

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

	if existing, ok := s.streams[infoHash]; ok && existing != nil {
		existing.refCount++
		existing.addFileInterest(fileIdx)
		log.Printf("Torrent %s: refcount=%d (reused)", infoHash, existing.refCount)
		return torrentServeURL(infoHash, fileIdx), infoHash, nil
	}

	stream := newTorrentStream(t, fileIdx)
	s.streams[infoHash] = stream

	go func() {
		if err := stream.ensureInfo(); err != nil {
			log.Printf("Torrent %s: metadata failed: %v", infoHash, err)
		}
	}()

	log.Printf("Torrent %s: refcount=%d (new)", infoHash, stream.refCount)
	return torrentServeURL(infoHash, fileIdx), infoHash, nil
}

func (s *TorrentStreamer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.IsEnabled() {
		http.Error(w, ErrTorrentingDisabled.Error(), http.StatusForbidden)
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/torrents/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	infoHash := parts[0]
	fileIdx := parseFileIdxQuery(r)

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

	file, filePath, err := stream.openFile(fileIdx)
	if err != nil {
		http.Error(w, fmt.Sprintf("torrent not ready: %v", err), http.StatusGatewayTimeout)
		return
	}
	if file == nil {
		http.Error(w, "torrent has no selected file", http.StatusInternalServerError)
		return
	}

	tr := file.NewReader()
	defer tr.Close()

	tr.SetResponsive()
	if r.URL.Query().Get("metadata") == "1" {
		tr.SetReadahead(256 * 1024 * 1024)
	} else {
		tr.SetReadahead(16 * 1024 * 1024)
	}
	name := filepath.Base(filePath)

	http.ServeContent(w, r, name, time.Now(), tr)
}

func (s *TorrentStreamer) RemoveTorrent(infoHash string, fileIdx *int) {
	s.mu.Lock()
	stream, ok := s.streams[infoHash]
	if !ok || stream == nil {
		s.mu.Unlock()
		return
	}

	stream.removeFileInterest(fileIdx)
	stream.refCount--
	shouldDrop := stream.refCount <= 0
	if shouldDrop {
		delete(s.streams, infoHash)
	}
	remaining := stream.refCount
	if remaining < 0 {
		remaining = 0
	}
	log.Printf("Torrent %s: refcount=%d after remove", infoHash, remaining)
	s.mu.Unlock()

	if !shouldDrop {
		return
	}

	stream.stop()
	if stream.t != nil {
		log.Printf("Dropping torrent %s", infoHash)
		stream.t.Drop()
	}
}

func (s *TorrentStreamer) GetStatus(infoHash string) (TorrentStatus, bool) {
	s.mu.RLock()
	stream, ok := s.streams[infoHash]
	s.mu.RUnlock()
	if !ok || stream == nil {
		return TorrentStatus{}, false
	}
	return stream.status(), true
}

func (s *TorrentStreamer) Close() {
	s.Disable()
}
