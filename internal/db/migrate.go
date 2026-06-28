package db

import (
	"database/sql"
	"fmt"
)

// migrations are applied in order; the database's PRAGMA user_version tracks how
// many have run. To evolve the schema, append a new entry (never edit a shipped
// one) — e.g. an `ALTER TABLE ... ADD COLUMN ...`. Each runs in its own transaction.
var migrations = []string{
	// 1: baseline schema (readings, agents, auth: users/passkeys/sessions/api_keys/settings).
	`
	CREATE TABLE IF NOT EXISTS readings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		platform TEXT NOT NULL,
		region TEXT NOT NULL,
		survivor INTEGER NOT NULL,
		killer INTEGER NOT NULL,
		ratio REAL NOT NULL,
		version TEXT,
		category TEXT,
		refresh_time_seconds INTEGER,
		measured_at INTEGER NOT NULL,
		agent_id INTEGER
	);
	CREATE INDEX IF NOT EXISTS readings_group_time ON readings (platform, region, measured_at);
	CREATE INDEX IF NOT EXISTS readings_agent ON readings (agent_id);

	CREATE TABLE IF NOT EXISTS agents (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		provision_id TEXT UNIQUE,
		token_hash TEXT NOT NULL UNIQUE,
		region TEXT NOT NULL,
		provider TEXT NOT NULL,
		platform TEXT NOT NULL,
		label TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		source TEXT NOT NULL,
		poll_min TEXT,
		poll_max TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS agents_token ON agents (token_hash);

	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		email TEXT, name TEXT,
		password_hash TEXT,
		role TEXT NOT NULL DEFAULT 'user',
		totp_secret TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS webauthn_credentials (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		credential_id TEXT NOT NULL UNIQUE,
		public_key TEXT NOT NULL,
		counter INTEGER NOT NULL,
		transports TEXT, label TEXT,
		created_at INTEGER NOT NULL, last_used_at INTEGER
	);
	CREATE INDEX IF NOT EXISTS webauthn_by_user ON webauthn_credentials (user_id);
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		auth_level TEXT NOT NULL,
		csrf_token TEXT NOT NULL,
		created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);
	CREATE TABLE IF NOT EXISTS api_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		key_hash TEXT NOT NULL UNIQUE,
		prefix TEXT NOT NULL, label TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL, last_used_at INTEGER, expires_at INTEGER
	);
	CREATE INDEX IF NOT EXISTS api_keys_by_user ON api_keys (user_id);
	CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`,
	// 2: trusted devices that let a browser skip MFA step-up until they expire.
	`
	CREATE TABLE IF NOT EXISTS trusted_devices (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		label TEXT,
		created_at INTEGER NOT NULL,
		last_used_at INTEGER,
		expires_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS trusted_devices_by_user ON trusted_devices (user_id);
	`,
}

// migrate applies any pending migrations, tracked by PRAGMA user_version.
func migrate(conn *sql.DB) error {
	var version int
	if err := conn.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	for i := version; i < len(migrations); i++ {
		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}
		// PRAGMA can't be parameterized; the value is a trusted loop index.
		if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
