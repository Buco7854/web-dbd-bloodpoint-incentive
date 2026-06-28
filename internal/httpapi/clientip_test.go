package httpapi

import (
	"net/netip"
	"testing"

	"github.com/buco7854/bloodpoint-incentives/internal/config"
)

func cidrs(t *testing.T, ss ...string) []netip.Prefix {
	t.Helper()
	var out []netip.Prefix
	for _, s := range ss {
		p, err := netip.ParsePrefix(s)
		if err != nil {
			t.Fatalf("bad cidr %q: %v", s, err)
		}
		out = append(out, p)
	}
	return out
}

func TestResolveClientIP(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		xff    string
		trust  config.ProxyTrust
		want   string
	}{
		{"no trust ignores forged xff", "203.0.113.9:5000", "1.2.3.4", config.ProxyTrust{}, "203.0.113.9"},
		{"no trust strips port", "203.0.113.9:5000", "", config.ProxyTrust{}, "203.0.113.9"},
		{"trust all takes leftmost client", "10.0.0.2:5000", "9.9.9.9, 10.0.0.5", config.ProxyTrust{All: true}, "9.9.9.9"},
		{"trusted cidr peer, single hop", "10.0.0.2:5000", "9.9.9.9", config.ProxyTrust{CIDRs: cidrs(t, "10.0.0.0/8")}, "9.9.9.9"},
		{"trusted cidr skips trusted hops", "10.0.0.2:5000", "9.9.9.9, 10.0.0.5", config.ProxyTrust{CIDRs: cidrs(t, "10.0.0.0/8")}, "9.9.9.9"},
		{"untrusted peer ignores xff", "203.0.113.9:5000", "9.9.9.9", config.ProxyTrust{CIDRs: cidrs(t, "10.0.0.0/8")}, "203.0.113.9"},
		{"spoofed inner xff not trusted", "10.0.0.2:5000", "1.1.1.1, 9.9.9.9", config.ProxyTrust{CIDRs: cidrs(t, "10.0.0.0/8")}, "9.9.9.9"},
		{"hop count one", "10.0.0.2:5000", "9.9.9.9", config.ProxyTrust{Hops: 1}, "9.9.9.9"},
		{"hop count two through two proxies", "10.0.0.2:5000", "9.9.9.9, 10.0.0.5", config.ProxyTrust{Hops: 2}, "9.9.9.9"},
		{"hop count clamps to chain", "10.0.0.2:5000", "9.9.9.9", config.ProxyTrust{Hops: 5}, "9.9.9.9"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveClientIP(tc.remote, tc.xff, tc.trust); got != tc.want {
				t.Fatalf("resolveClientIP(%q, %q) = %q, want %q", tc.remote, tc.xff, got, tc.want)
			}
		})
	}
}
