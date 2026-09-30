//go:build !debug

package frontend

import (
	_ "embed"
	"net/http"
	"strconv"
)

//go:generate bun build --compile --target=browser index.html --production --outfile=dist.html
//go:embed dist.html
var editor []byte

var Serve http.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	w.Header().Set("Content-Length", strconv.FormatInt(int64(len(editor)), 10))
	w.WriteHeader(http.StatusOK)
	if r.Method != "HEAD" {
		w.Write(editor)
	}
})
