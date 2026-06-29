package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/buco7854/bloodpoint-incentives/internal/domain"
)

// apiPrefixes are paths owned by the API/docs; a miss there is a real 404, not an SPA route.
var apiPrefixes = []string{"/api/", "/openapi", "/docs", "/healthz", "/schemas/"}

// registerStatic serves the built SPA from PublicDir with history-API fallback to index.html.
func (s *Server) registerStatic() {
	dir := s.deps.PublicDir
	if dir == "" {
		return
	}
	index := filepath.Join(dir, "index.html")
	fileServer := http.FileServer(http.Dir(dir))

	s.Router.Get("/", s.redirectRoot)

	s.Router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		for _, p := range apiPrefixes {
			if strings.HasPrefix(path, p) {
				http.NotFound(w, r)
				return
			}
		}
		// Serve a real file when it exists; otherwise fall back to the SPA shell.
		clean := filepath.Join(dir, filepath.Clean("/"+path))
		if info, err := os.Stat(clean); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		s.serveShell(w, r, index)
	})
}

// redirectRoot sends the bare root to the default platform's home so every content
// URL is platform-scoped (302 since the default platform may change).
func (s *Server) redirectRoot(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/platforms/"+string(domain.DefaultPlatform), http.StatusFound)
}

// serveShell renders index.html with resolved OG/canonical URLs and robots
// metadata for the request path.
func (s *Server) serveShell(w http.ResponseWriter, r *http.Request, index string) {
	raw, err := os.ReadFile(index)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	doIndex := s.seoEnabled() && s.indexablePath(r.URL.Path)
	if !doIndex {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Content-Security-Policy", shellCSP)
	_, _ = w.Write([]byte(s.renderShell(string(raw), r.URL.Path, doIndex)))
}
