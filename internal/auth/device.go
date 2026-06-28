package auth

import (
	"net/http"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

// DeviceCookie remembers a browser so it can skip MFA step-up until it expires.
const DeviceCookie = "bp_device"

const deviceTTL = 30 * 24 * time.Hour

func (a *AuthService) deviceCookie(value string, maxAgeSeconds int) *http.Cookie {
	return &http.Cookie{
		Name: DeviceCookie, Value: value, Path: "/",
		HttpOnly: true, Secure: a.cookieSecure, SameSite: http.SameSiteLaxMode,
		MaxAge: maxAgeSeconds,
	}
}

// RememberDevice mints a trusted-device token for the user and returns the cookie to set.
func (a *AuthService) RememberDevice(userID int64, label *string) (*http.Cookie, error) {
	raw := token.Generate()
	expires := time.Now().Add(deviceTTL).UnixMilli()
	if err := a.Repo.CreateTrustedDevice(db.NewTrustedDevice{UserID: userID, TokenHash: token.Hash(raw), Label: label, ExpiresAt: expires}); err != nil {
		return nil, err
	}
	return a.deviceCookie(a.sign(raw), int(deviceTTL/time.Second)), nil
}

// DeviceTrusted reports whether the raw device cookie is a live trusted device for userID.
func (a *AuthService) DeviceTrusted(rawCookie string, userID int64) bool {
	if rawCookie == "" {
		return false
	}
	raw, ok := a.unsign(rawCookie)
	if !ok {
		return false
	}
	d, found, err := a.Repo.GetTrustedDeviceByHash(token.Hash(raw), time.Now().UnixMilli())
	if err != nil || !found || d.UserID != userID {
		return false
	}
	_ = a.Repo.TouchTrustedDevice(d.ID)
	return true
}

// ClearedDeviceCookie expires the device cookie.
func (a *AuthService) ClearedDeviceCookie() *http.Cookie {
	return a.deviceCookie("", -1)
}

// ForgetDevices revokes every remembered device for a user.
func (a *AuthService) ForgetDevices(userID int64) error {
	_, err := a.Repo.DeleteTrustedDevicesForUser(userID)
	return err
}
