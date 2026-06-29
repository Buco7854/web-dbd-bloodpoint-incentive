package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// UserRole is a role a user can hold.
type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

// IsUserRole reports whether s is a valid role.
func IsUserRole(s string) bool { return s == string(RoleAdmin) || s == string(RoleUser) }

// AuthLevel is a session's authentication strength.
type AuthLevel string

const (
	AuthPassword AuthLevel = "password"
	AuthMFA      AuthLevel = "mfa"
)

// UserRow is a user as stored, including secrets. Never serialize directly.
type UserRow struct {
	ID           int64
	Username     string
	Email        *string
	Name         *string
	PasswordHash *string
	Role         UserRole
	TotpSecret   *string
	Enabled      bool
	CreatedAt    int64
	UpdatedAt    int64
	LastLoginAt  *int64
}

// CredentialRow is a stored WebAuthn passkey.
type CredentialRow struct {
	ID           int64
	UserID       int64
	CredentialID string
	PublicKey    string
	Counter      int64
	Transports   []string
	Label        *string
	CreatedAt    int64
	LastUsedAt   *int64
}

// SessionRow is a login/admin session.
type SessionRow struct {
	ID         string
	UserID     int64
	AuthLevel  AuthLevel
	CSRFToken  string
	CreatedAt  int64
	ExpiresAt  int64
	LastSeenAt int64
}

// APIKeyRow is a user's API key (only the hash is stored).
type APIKeyRow struct {
	ID         int64
	UserID     int64
	KeyHash    string
	Prefix     string
	Label      *string
	Enabled    bool
	CreatedAt  int64
	LastUsedAt *int64
	ExpiresAt  *int64
}

// NewUser carries the fields to create a user.
type NewUser struct {
	Username     string
	Email        *string
	Name         *string
	PasswordHash *string
	Role         UserRole
}

// AuthRepo stores users, passkeys, sessions, API keys, and app settings.
type AuthRepo struct {
	db  *sql.DB
	now func() int64
}

// NewAuthRepo returns the auth repository (schema is created by migrate).
func NewAuthRepo(conn *sql.DB) (*AuthRepo, error) {
	return &AuthRepo{db: conn, now: func() int64 { return time.Now().UnixMilli() }}, nil
}

const userCols = `id, username, email, name, password_hash, role, totp_secret, enabled, created_at, updated_at, last_login_at`

func scanUser(s interface{ Scan(...any) error }) (UserRow, error) {
	var (
		u       UserRow
		role    string
		enabled int
	)
	err := s.Scan(&u.ID, &u.Username, &u.Email, &u.Name, &u.PasswordHash, &role, &u.TotpSecret, &enabled, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return UserRow{}, err
	}
	if IsUserRole(role) {
		u.Role = UserRole(role)
	} else {
		u.Role = RoleUser
	}
	u.Enabled = enabled == 1
	return u, nil
}

func (r *AuthRepo) CreateUser(u NewUser) (UserRow, error) {
	ts := r.now()
	res, err := r.db.Exec(
		`INSERT INTO users (username, email, name, password_hash, role, enabled, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
		u.Username, u.Email, u.Name, u.PasswordHash, string(u.Role), ts, ts)
	if err != nil {
		return UserRow{}, err
	}
	id, _ := res.LastInsertId()
	user, _, err := r.GetUserByID(id)
	return user, err
}

func (r *AuthRepo) getUser(where string, arg any) (UserRow, bool, error) {
	u, err := scanUser(r.db.QueryRow(`SELECT `+userCols+` FROM users WHERE `+where, arg))
	if err == sql.ErrNoRows {
		return UserRow{}, false, nil
	}
	if err != nil {
		return UserRow{}, false, err
	}
	return u, true, nil
}

func (r *AuthRepo) GetUserByID(id int64) (UserRow, bool, error) { return r.getUser("id = ?", id) }
func (r *AuthRepo) GetUserByUsername(name string) (UserRow, bool, error) {
	return r.getUser("username = ?", name)
}

func (r *AuthRepo) ListUsers() ([]UserRow, error) {
	rows, err := r.db.Query(`SELECT ` + userCols + ` FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *AuthRepo) AdminCount() (int, error) {
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin' AND enabled = 1`).Scan(&n)
	return n, err
}

func (r *AuthRepo) AdminExists() bool {
	n, _ := r.AdminCount()
	return n > 0
}

func (r *AuthRepo) SetPassword(id int64, hash string) error {
	_, err := r.db.Exec(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, r.now(), id)
	return err
}

func (r *AuthRepo) SetTotpSecret(id int64, secret *string) error {
	_, err := r.db.Exec(`UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?`, secret, r.now(), id)
	return err
}

// GetTotpLastStep returns the highest TOTP time-step counter already accepted for
// the user (0 if none). Used to reject replayed codes.
func (r *AuthRepo) GetTotpLastStep(id int64) (int64, error) {
	var step int64
	err := r.db.QueryRow(`SELECT totp_last_step FROM users WHERE id = ?`, id).Scan(&step)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return step, err
}

// SetTotpLastStep records the most recent accepted TOTP time-step counter.
func (r *AuthRepo) SetTotpLastStep(id, step int64) error {
	_, err := r.db.Exec(`UPDATE users SET totp_last_step = ? WHERE id = ?`, step, id)
	return err
}

func (r *AuthRepo) SetRole(id int64, role UserRole) error {
	_, err := r.db.Exec(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, string(role), r.now(), id)
	return err
}

func (r *AuthRepo) SetEnabled(id int64, enabled bool) error {
	e := 0
	if enabled {
		e = 1
	}
	_, err := r.db.Exec(`UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?`, e, r.now(), id)
	return err
}

func (r *AuthRepo) TouchLogin(id int64) error {
	_, err := r.db.Exec(`UPDATE users SET last_login_at = ? WHERE id = ?`, r.now(), id)
	return err
}

// DeleteUser removes a user and all of their auth records. The deletes run in one
// transaction so a mid-way failure can't leave orphaned sessions/keys/credentials
// behind a still-present user (or vice versa).
func (r *AuthRepo) DeleteUser(id int64) error {
	return r.inTx(func(tx *sql.Tx) error {
		for _, q := range []string{
			`DELETE FROM sessions WHERE user_id = ?`,
			`DELETE FROM api_keys WHERE user_id = ?`,
			`DELETE FROM webauthn_credentials WHERE user_id = ?`,
			`DELETE FROM trusted_devices WHERE user_id = ?`,
			`DELETE FROM users WHERE id = ?`,
		} {
			if _, err := tx.Exec(q, id); err != nil {
				return err
			}
		}
		return nil
	})
}

// ResetMfa clears a user's TOTP and all passkeys, transactionally so the account
// can't be left half-reset.
func (r *AuthRepo) ResetMfa(userID int64) error {
	return r.inTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`UPDATE users SET totp_secret = NULL, totp_last_step = 0, updated_at = ? WHERE id = ?`, r.now(), userID); err != nil {
			return err
		}
		_, err := tx.Exec(`DELETE FROM webauthn_credentials WHERE user_id = ?`, userID)
		return err
	})
}

// inTx runs fn inside a transaction, rolling back on error.
func (r *AuthRepo) inTx(fn func(*sql.Tx) error) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// --- credentials ---

const credCols = `id, user_id, credential_id, public_key, counter, transports, label, created_at, last_used_at`

func scanCred(s interface{ Scan(...any) error }) (CredentialRow, error) {
	var (
		c          CredentialRow
		transports sql.NullString
	)
	if err := s.Scan(&c.ID, &c.UserID, &c.CredentialID, &c.PublicKey, &c.Counter, &transports, &c.Label, &c.CreatedAt, &c.LastUsedAt); err != nil {
		return CredentialRow{}, err
	}
	if transports.Valid && transports.String != "" {
		_ = json.Unmarshal([]byte(transports.String), &c.Transports)
	}
	return c, nil
}

func (r *AuthRepo) AddCredential(c CredentialRow) error {
	tj, _ := json.Marshal(c.Transports)
	_, err := r.db.Exec(
		`INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, label, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.UserID, c.CredentialID, c.PublicKey, c.Counter, string(tj), c.Label, r.now())
	return err
}

func (r *AuthRepo) CredentialsForUser(userID int64) ([]CredentialRow, error) {
	rows, err := r.db.Query(`SELECT `+credCols+` FROM webauthn_credentials WHERE user_id = ? ORDER BY id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CredentialRow{}
	for rows.Next() {
		c, err := scanCred(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *AuthRepo) GetCredential(credentialID string) (CredentialRow, bool, error) {
	c, err := scanCred(r.db.QueryRow(`SELECT `+credCols+` FROM webauthn_credentials WHERE credential_id = ?`, credentialID))
	if err == sql.ErrNoRows {
		return CredentialRow{}, false, nil
	}
	if err != nil {
		return CredentialRow{}, false, err
	}
	return c, true, nil
}

func (r *AuthRepo) UpdateCredentialCounter(credentialID string, counter int64) error {
	_, err := r.db.Exec(`UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?`, counter, r.now(), credentialID)
	return err
}

func (r *AuthRepo) DeleteCredential(id, userID int64) error {
	_, err := r.db.Exec(`DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

// --- sessions ---

const sessionCols = `id, user_id, auth_level, csrf_token, created_at, expires_at, last_seen_at`

func scanSession(s interface{ Scan(...any) error }) (SessionRow, error) {
	var (
		sr    SessionRow
		level string
	)
	if err := s.Scan(&sr.ID, &sr.UserID, &level, &sr.CSRFToken, &sr.CreatedAt, &sr.ExpiresAt, &sr.LastSeenAt); err != nil {
		return SessionRow{}, err
	}
	if level == string(AuthMFA) {
		sr.AuthLevel = AuthMFA
	} else {
		sr.AuthLevel = AuthPassword
	}
	return sr, nil
}

// NewSession carries the fields to create a session.
type NewSession struct {
	ID        string
	UserID    int64
	AuthLevel AuthLevel
	CSRF      string
	TTLMs     int64
}

func (r *AuthRepo) CreateSession(s NewSession) (SessionRow, error) {
	ts := r.now()
	_, err := r.db.Exec(
		`INSERT INTO sessions (id, user_id, auth_level, csrf_token, created_at, expires_at, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.UserID, string(s.AuthLevel), s.CSRF, ts, ts+s.TTLMs, ts)
	if err != nil {
		return SessionRow{}, err
	}
	row, _, err := r.GetSession(s.ID)
	return row, err
}

func (r *AuthRepo) GetSession(id string) (SessionRow, bool, error) {
	s, err := scanSession(r.db.QueryRow(`SELECT `+sessionCols+` FROM sessions WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return SessionRow{}, false, nil
	}
	if err != nil {
		return SessionRow{}, false, err
	}
	return s, true, nil
}

func (r *AuthRepo) UpgradeSession(id string, level AuthLevel) error {
	_, err := r.db.Exec(`UPDATE sessions SET auth_level = ?, last_seen_at = ? WHERE id = ?`, string(level), r.now(), id)
	return err
}

func (r *AuthRepo) TouchSession(id string) error {
	_, err := r.db.Exec(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`, r.now(), id)
	return err
}

func (r *AuthRepo) DeleteSession(id string) error {
	_, err := r.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}

func (r *AuthRepo) PruneSessions() (int64, error) {
	res, err := r.db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, r.now())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// --- api keys ---

const apiKeyCols = `id, user_id, key_hash, prefix, label, enabled, created_at, last_used_at, expires_at`

func scanAPIKey(s interface{ Scan(...any) error }) (APIKeyRow, error) {
	var (
		k       APIKeyRow
		enabled int
	)
	if err := s.Scan(&k.ID, &k.UserID, &k.KeyHash, &k.Prefix, &k.Label, &enabled, &k.CreatedAt, &k.LastUsedAt, &k.ExpiresAt); err != nil {
		return APIKeyRow{}, err
	}
	k.Enabled = enabled == 1
	return k, nil
}

// NewAPIKey carries the fields to create an API key.
type NewAPIKey struct {
	UserID    int64
	KeyHash   string
	Prefix    string
	Label     *string
	ExpiresAt *int64
}

func (r *AuthRepo) CreateAPIKey(k NewAPIKey) (APIKeyRow, error) {
	res, err := r.db.Exec(
		`INSERT INTO api_keys (user_id, key_hash, prefix, label, enabled, created_at, expires_at)
		 VALUES (?, ?, ?, ?, 1, ?, ?)`,
		k.UserID, k.KeyHash, k.Prefix, k.Label, r.now(), k.ExpiresAt)
	if err != nil {
		return APIKeyRow{}, err
	}
	id, _ := res.LastInsertId()
	row, err := scanAPIKey(r.db.QueryRow(`SELECT `+apiKeyCols+` FROM api_keys WHERE id = ?`, id))
	return row, err
}

func (r *AuthRepo) ListAPIKeysForUser(userID int64) ([]APIKeyRow, error) {
	rows, err := r.db.Query(`SELECT `+apiKeyCols+` FROM api_keys WHERE user_id = ? ORDER BY id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []APIKeyRow{}
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// GetAPIKeyByHash returns an enabled, unexpired key by hash (ok=false otherwise).
func (r *AuthRepo) GetAPIKeyByHash(hash string, nowMs int64) (APIKeyRow, bool, error) {
	k, err := scanAPIKey(r.db.QueryRow(`SELECT `+apiKeyCols+` FROM api_keys WHERE key_hash = ?`, hash))
	if err == sql.ErrNoRows {
		return APIKeyRow{}, false, nil
	}
	if err != nil {
		return APIKeyRow{}, false, err
	}
	if !k.Enabled || (k.ExpiresAt != nil && *k.ExpiresAt <= nowMs) {
		return APIKeyRow{}, false, nil
	}
	return k, true, nil
}

func (r *AuthRepo) DeleteAPIKey(id, userID int64) error {
	_, err := r.db.Exec(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

// SetAPIKeyEnabled enables or disables a key the user owns, returning the updated row.
func (r *AuthRepo) SetAPIKeyEnabled(id, userID int64, enabled bool) (APIKeyRow, bool, error) {
	e := 0
	if enabled {
		e = 1
	}
	res, err := r.db.Exec(`UPDATE api_keys SET enabled = ? WHERE id = ? AND user_id = ?`, e, id, userID)
	if err != nil {
		return APIKeyRow{}, false, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return APIKeyRow{}, false, nil
	}
	row, err := scanAPIKey(r.db.QueryRow(`SELECT `+apiKeyCols+` FROM api_keys WHERE id = ?`, id))
	return row, err == nil, err
}

func (r *AuthRepo) TouchAPIKeyUsed(id int64) error {
	_, err := r.db.Exec(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, r.now(), id)
	return err
}

// --- trusted devices (MFA "remember this device") ---

// TrustedDeviceRow is a browser that may skip MFA step-up until it expires.
type TrustedDeviceRow struct {
	ID         int64
	UserID     int64
	TokenHash  string
	Label      *string
	CreatedAt  int64
	LastUsedAt *int64
	ExpiresAt  int64
}

// NewTrustedDevice carries the fields to remember a device.
type NewTrustedDevice struct {
	UserID    int64
	TokenHash string
	Label     *string
	ExpiresAt int64
}

func (r *AuthRepo) CreateTrustedDevice(d NewTrustedDevice) error {
	_, err := r.db.Exec(
		`INSERT INTO trusted_devices (user_id, token_hash, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		d.UserID, d.TokenHash, d.Label, r.now(), d.ExpiresAt)
	return err
}

// GetTrustedDeviceByHash returns an unexpired device by token hash (ok=false otherwise).
func (r *AuthRepo) GetTrustedDeviceByHash(hash string, nowMs int64) (TrustedDeviceRow, bool, error) {
	var (
		d     TrustedDeviceRow
		label sql.NullString
		used  sql.NullInt64
	)
	err := r.db.QueryRow(
		`SELECT id, user_id, token_hash, label, created_at, last_used_at, expires_at FROM trusted_devices WHERE token_hash = ?`, hash).
		Scan(&d.ID, &d.UserID, &d.TokenHash, &label, &d.CreatedAt, &used, &d.ExpiresAt)
	if err == sql.ErrNoRows {
		return TrustedDeviceRow{}, false, nil
	}
	if err != nil {
		return TrustedDeviceRow{}, false, err
	}
	if d.ExpiresAt <= nowMs {
		return TrustedDeviceRow{}, false, nil
	}
	if label.Valid {
		d.Label = &label.String
	}
	if used.Valid {
		d.LastUsedAt = &used.Int64
	}
	return d, true, nil
}

func (r *AuthRepo) TouchTrustedDevice(id int64) error {
	_, err := r.db.Exec(`UPDATE trusted_devices SET last_used_at = ? WHERE id = ?`, r.now(), id)
	return err
}

// DeleteTrustedDevicesForUser revokes every remembered device for a user.
func (r *AuthRepo) DeleteTrustedDevicesForUser(userID int64) (int64, error) {
	res, err := r.db.Exec(`DELETE FROM trusted_devices WHERE user_id = ?`, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// PruneTrustedDevices removes expired device records.
func (r *AuthRepo) PruneTrustedDevices() (int64, error) {
	res, err := r.db.Exec(`DELETE FROM trusted_devices WHERE expires_at <= ?`, r.now())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// --- settings ---

func (r *AuthRepo) GetSetting(key string) (string, bool) {
	var v string
	err := r.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&v)
	if err != nil {
		return "", false
	}
	return v, true
}

func (r *AuthRepo) SetSetting(key, value string) error {
	_, err := r.db.Exec(
		`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value)
	return err
}
