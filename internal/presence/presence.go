// Package presence tracks distinct visitors currently viewing the site, keyed by
// client IP with a TTL so a dropped connection self-heals.
package presence

import (
	"sync"
	"time"
)

const sweepThreshold = 10_000

// Tracker marks visitors active and counts those still within their TTL.
type Tracker interface {
	Touch(visitorID string, ttl time.Duration)
	Count() int
}

// InMemory is a TTL map of visitor id -> expiry.
type InMemory struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

// New returns an in-memory presence tracker.
func New() *InMemory { return &InMemory{seen: map[string]time.Time{}} }

func (t *InMemory) Touch(visitorID string, ttl time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.seen[visitorID] = time.Now().Add(ttl)
	if len(t.seen) > sweepThreshold {
		t.sweepLocked()
	}
}

func (t *InMemory) Count() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.sweepLocked()
}

func (t *InMemory) sweepLocked() int {
	now := time.Now()
	for id, exp := range t.seen {
		if !exp.After(now) {
			delete(t.seen, id)
		}
	}
	return len(t.seen)
}
