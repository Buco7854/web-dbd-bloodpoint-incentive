package httpapi

import "net/http"

// maxRequestBytes caps the request body the hub will read. Huma validates body
// *shape* but not raw size, so without this an unbounded JSON body (e.g. a flood
// of agent readings or a huge admin import) is fully read and parsed before any
// limit applies. 1 MiB is far above any legitimate request here.
const maxRequestBytes = 1 << 20

// limitBodyMiddleware wraps every request body in an http.MaxBytesReader so an
// oversized payload is rejected as it is read rather than buffered in full. GET
// and SSE requests carry no body, so this is a no-op for them.
func limitBodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeadersMiddleware adds defense-in-depth response headers to every
// response. These are framework-agnostic and safe for the API, docs, and static
// assets alike. The SPA shell additionally sets a Content-Security-Policy in
// serveShell (a global CSP would break the /docs UI, which loads its own assets).
//
// hsts is enabled only when the hub believes it is served over HTTPS (COOKIE_SECURE
// / an https origin); sending HSTS over plain HTTP for a local/Docker deployment
// would be wrong.
func securityHeadersMiddleware(hsts bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			if hsts {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// shellCSP is the Content-Security-Policy for the SPA shell. It allows the app's
// own bundle, inline styles (Tailwind/chart runtime), and data: image URIs (the
// TOTP QR code is a data URL), forbids framing, and restricts connections to the
// same origin (the SSE stream and API are same-origin).
const shellCSP = "default-src 'self'; " +
	"img-src 'self' data:; " +
	"style-src 'self' 'unsafe-inline'; " +
	"script-src 'self'; " +
	"connect-src 'self'; " +
	"frame-ancestors 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'"
