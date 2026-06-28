package db

import "testing"

func TestMigrateSetsVersionAndIsIdempotent(t *testing.T) {
	conn, err := Open(":memory:") // Open runs migrate
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	var version int
	if err := conn.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != len(migrations) {
		t.Fatalf("user_version = %d, want %d", version, len(migrations))
	}

	// Re-running is a no-op (no pending migrations).
	if err := migrate(conn); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}

	// A baseline table exists and is usable.
	if _, err := conn.Exec(`INSERT INTO app_settings (key, value) VALUES ('k','v')`); err != nil {
		t.Fatalf("schema not created: %v", err)
	}
}
