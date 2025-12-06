package stream

import (
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

	log.Printf("Added torrent, waiting for metadata...")
	<-t.GotInfo()
	log.Printf("Got info for torrent %s: %q, length=%d bytes",
		t.InfoHash().HexString(), t.Name(), t.Length())

	files := t.Files()

	// Pick target file
	var targetFile *torrent.File
	if fileIdx != nil && *fileIdx >= 0 && *fileIdx < len(files) {
		targetFile = files[*fileIdx]
		log.Printf("Using specified file index %d: %q", *fileIdx, targetFile.Path())
	} else {
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
		return "", "", fmt.Errorf("no files found in torrent")
	}

	// Disable download for all other files so we don't fill disk with the whole season
	for _, f := range files {
		if f != targetFile {
			f.SetPriority(torrent.PiecePriorityNone)
		}
	}

	// Enable download only for this file
	targetFile.Download() // marks its pieces as wanted [web:18]

	pl := int64(t.Info().PieceLength)
	if pl <= 0 {
		return "", "", fmt.Errorf("invalid piece length: %d", pl)
	}

	startPiece := int(targetFile.Offset() / pl)
	endPiece := int((targetFile.Offset() + 10*1024*1024) / pl)
	if startPiece < 0 || startPiece >= t.NumPieces() {
		return "", "", fmt.Errorf("startPiece %d out of range (numPieces=%d)", startPiece, t.NumPieces())
	}
	if endPiece >= t.NumPieces() {
		endPiece = t.NumPieces() - 1
	}

	log.Printf("Streaming file %q (%d bytes), startPiece=%d endPiece=%d pieceLen=%d",
		targetFile.Path(), targetFile.Length(), startPiece, endPiece, pl)

	// Aggressively prioritize the first ~10MB for fast start
	for i := startPiece; i <= endPiece; i++ {
		p := t.Piece(i)
		p.SetPriority(torrent.PiecePriorityNow)
	}

	// Stats logger
	go func() {
		for range time.Tick(5 * time.Second) {
			st := t.Stats()
			log.Printf("Torrent %s: peers=%d, have=%d/%d, downUseful=%dB, up=%dB",
				t.InfoHash().HexString(),
				st.ActivePeers,
				st.PiecesComplete,
				t.NumPieces(),
				st.BytesReadUsefulData.Int64(),
				st.BytesWrittenData.Int64(),
			)
		}
	}()

	log.Printf("Waiting for first piece of torrent %s (piece %d)...",
		t.InfoHash().HexString(), startPiece)

	deadline := time.Now().Add(90 * time.Second)
	for {
		if t.Piece(startPiece).State().Complete {
			log.Printf("First piece ready, streaming can start")
			break
		}
		if time.Now().After(deadline) {
			log.Printf("Timeout waiting for first piece, proceeding anyway")
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	infoHash := t.InfoHash().HexString()
	s.mu.Lock()
	s.streams[infoHash] = &TorrentStream{
		t:        t,
		file:     targetFile,
		filePath: targetFile.Path(),
	}
	s.mu.Unlock()

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
	if !ok || stream == nil || stream.file == nil {
		http.NotFound(w, r)
		return
	}

	tr := stream.file.NewReader()
	defer tr.Close()

	tr.SetResponsive()
	tr.SetReadahead(10 * 1024 * 1024)
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
