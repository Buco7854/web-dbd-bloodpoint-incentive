// Package db owns the hub's SQLite connection and its repositories (readings,
// agents, auth). All repositories share one *sql.DB so they live in one file and
// one transaction domain; each creates its own tables on construction.
package db

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Open opens (and configures) the hub's SQLite database. Pass ":memory:" for tests.
func Open(path string) (*sql.DB, error) {
	dsn := path
	if path != ":memory:" {
		if dir := filepath.Dir(path); dir != "" {
			_ = os.MkdirAll(dir, 0o755)
		}
		dsn = "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	}
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite allows only one writer at a time. With Go's default (unbounded) pool,
	// concurrent writers from different connections race for the write lock and, once
	// busy_timeout elapses, fail with SQLITE_BUSY — and Store.Ingest only logs that,
	// silently dropping the reading. Pinning the pool to a single connection serializes
	// all access so writes never collide; at this app's scale the lost read concurrency
	// is negligible (and WAL still lets the one connection read during a write). The
	// :memory: case must also be single-connection or the database vanishes between calls.
	conn.SetMaxOpenConns(1)
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, err
	}
	if err := migrate(conn); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}
