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
	// A single in-memory database lives only as long as its one connection, so pin
	// the pool to one connection for the :memory: case (tests).
	if path == ":memory:" {
		conn.SetMaxOpenConns(1)
	}
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
