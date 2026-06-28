package httpapi

import "net/http"

const corsAllowHeaders = "Authorization, Content-Type, X-API-Key, X-CSRF-Token"

// corsMiddleware lets browsers on the configured origins (e.g. the docs site's
// interactive "Try it") call the API cross-origin and answers preflight requests.
// Only allowlisted origins are reflected; "*" allows any origin without
// credentials. Non-matching requests pass through untouched (same-origin still works).
func corsMiddleware(origins []string) func(http.Handler) http.Handler {
	allowAll := false
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		if o == "*" {
			allowAll = true
		}
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAll || allowed[origin]) {
				h := w.Header()
				if allowAll {
					h.Set("Access-Control-Allow-Origin", "*")
				} else {
					h.Set("Access-Control-Allow-Origin", origin)
					h.Add("Vary", "Origin")
					h.Set("Access-Control-Allow-Credentials", "true")
				}
				if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
					h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
					h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
					h.Set("Access-Control-Max-Age", "600")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
