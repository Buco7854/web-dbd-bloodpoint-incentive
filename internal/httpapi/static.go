package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
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
		http.ServeFile(w, r, index)
	})
}
