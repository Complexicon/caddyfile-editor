//go:build debug

package frontend

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
)

func init() {
	var _, callerSource, _, _ = runtime.Caller(0)
	var bundler = exec.Command("bun", path.Join(filepath.Dir(callerSource), "dev.ts"))
	bundler.Dir = filepath.Dir(callerSource)
	bundler.Stdout = os.Stdout
	bundler.Stderr = os.Stderr

	bundler.Start()
	var _url, _ = url.Parse("http://localhost:5173")
	Serve = httputil.NewSingleHostReverseProxy(_url)
}

var Serve http.Handler
