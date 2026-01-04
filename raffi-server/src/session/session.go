package session

import (
	"errors"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type SessionKind string

const (
	SessionKindHTTP    SessionKind = "http"
	SessionKindTorrent SessionKind = "torrent"
)

type Session struct {
	ID               string       `json:"id"`
	Source           string       `json:"source"`
	Kind             SessionKind  `json:"kind"`
	CreatedAt        time.Time    `json:"createdAt"`
	StartTime        float64      `json:"startTime"`
	DurationSeconds  float64      `json:"durationSeconds,omitempty"`
	Chapters         []Chapter    `json:"chapters,omitempty"`
	AvailableStreams []StreamInfo `json:"availableStreams,omitempty"`
	AudioIndex       int          `json:"audioIndex"`
	IsTorrent        bool         `json:"isTorrent,omitempty"`
	TorrentInfoHash  string       `json:"torrentInfoHash,omitempty"`
}

type StreamInfo struct {
	Index    int    `json:"index"`
	Type     string `json:"type"` // "audio" or "subtitle"
	Codec    string `json:"codec"`
	Language string `json:"language"`
	Title    string `json:"title"`
}

type Chapter struct {
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
	Title     string  `json:"title"`
}

type Store interface {
	Create(source string, kind SessionKind, startTime float64) (*Session, error)
	Get(id string) (*Session, error)
}

type memoryStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewMemoryStore() Store {
	rand.Seed(time.Now().UnixNano())
	return &memoryStore{
		sessions: make(map[string]*Session),
	}
}

func (s *memoryStore) Create(source string, kind SessionKind, startTime float64) (*Session, error) {
	if source == "" {
		return nil, errors.New("source is required")
	}
	if kind == "" {
		kind = SessionKindHTTP
	}

	id := randomID(12)
	sess := &Session{
		ID:              id,
		Source:          source,
		Kind:            kind,
		CreatedAt:       time.Now(),
		StartTime:       startTime,
		DurationSeconds: 0,
		Chapters:        nil,
	}

	if kind == SessionKindHTTP {
		dir := TempDirForSession(id)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}

	s.mu.Lock()
	s.sessions[id] = sess
	s.mu.Unlock()

	return sess, nil
}

func (s *memoryStore) Get(id string) (*Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return sess, nil
}

func TempDirForSession(id string) string {
	return filepath.Join(os.TempDir(), "raffi", id)
}

func randomID(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
