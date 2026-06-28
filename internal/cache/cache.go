// Package cache defines the hub's single cache port: a generic key/value store
// with optional per-entry expiry. The in-memory implementation is the default;
// a Redis (or other) backend can satisfy the same interface later.
package cache

import (
	"sync"
	"time"
)

// Cache is a key/value cache. A ttl <= 0 means the entry never expires.
// A Redis backend maps cleanly: SET key val [PX ttl] / GET / DEL.
type Cache[V any] interface {
	Get(key string) (V, bool)
	Set(key string, value V, ttl time.Duration)
	Delete(key string)
}

// Memory is the default in-memory cache.
type Memory[V any] struct {
	mu      sync.Mutex
	entries map[string]entry[V]
}

type entry[V any] struct {
	value   V
	expires time.Time // zero = never expires
}

// NewMemory returns an in-memory cache.
func NewMemory[V any]() *Memory[V] {
	return &Memory[V]{entries: map[string]entry[V]{}}
}

func (c *Memory[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	if !ok {
		var zero V
		return zero, false
	}
	if !e.expires.IsZero() && time.Now().After(e.expires) {
		delete(c.entries, key)
		var zero V
		return zero, false
	}
	return e.value, true
}

func (c *Memory[V]) Set(key string, value V, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var expires time.Time
	if ttl > 0 {
		expires = time.Now().Add(ttl)
	}
	c.entries[key] = entry[V]{value: value, expires: expires}
}

func (c *Memory[V]) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}
