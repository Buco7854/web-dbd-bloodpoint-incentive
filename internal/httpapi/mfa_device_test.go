package httpapi

import (
	"encoding/json"
	"testing"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
)

// loginNext logs in and returns the server's "next" step.
func loginNext(t *testing.T, srv *Server, deviceCookie string) string {
	t.Helper()
	headers := map[string]string{}
	if deviceCookie != "" {
		headers["Cookie"] = deviceCookie
	}
	rec := do(srv, "POST", "/api/v1/auth/login", `{"username":"admin","password":"supersecret1"}`, headers)
	if rec.Code != 200 {
		t.Fatalf("login = %d: %s", rec.Code, rec.Body)
	}
	var body struct {
		Next string `json:"next"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Next
}

func TestRememberDeviceSkipsMfa(t *testing.T) {
	srv := newAuthServer(t, false, false)

	if rec := do(srv, "POST", "/api/v1/auth/setup", `{"username":"admin","password":"supersecret1"}`, nil); rec.Code != 201 {
		t.Fatalf("setup = %d: %s", rec.Code, rec.Body)
	}
	user, _, _ := srv.deps.AuthRepo.GetUserByUsername("admin")
	secret := auth.GenerateTotpSecret()
	if err := srv.deps.AuthRepo.SetTotpSecret(user.ID, &secret); err != nil {
		t.Fatal(err)
	}

	// With a second factor configured, a plain login needs MFA step-up.
	if next := loginNext(t, srv, ""); next != "mfa" {
		t.Fatalf("login without device = %q, want mfa", next)
	}

	// A valid trusted-device cookie skips step-up.
	cookie, err := srv.deps.Auth.RememberDevice(user.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	deviceHdr := cookie.Name + "=" + cookie.Value
	if next := loginNext(t, srv, deviceHdr); next != "ok" {
		t.Fatalf("login with trusted device = %q, want ok", next)
	}

	// A bogus device cookie does not.
	if next := loginNext(t, srv, auth.DeviceCookie+"=not-a-real-token"); next != "mfa" {
		t.Fatalf("login with bogus device = %q, want mfa", next)
	}

	// Forgetting devices revokes the cookie.
	if err := srv.deps.Auth.ForgetDevices(user.ID); err != nil {
		t.Fatal(err)
	}
	if next := loginNext(t, srv, deviceHdr); next != "mfa" {
		t.Fatalf("login after forget = %q, want mfa", next)
	}
}
