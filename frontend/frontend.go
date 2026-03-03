package frontend

import (
	"adminpanel/app"
	"embed"
	"io/fs"
	"net/http"
)

//go:generate bun spark/bundler --prod
//go:embed all:dist
var _distEmbed embed.FS

func init() {
	var subfs, _ = fs.Sub(_distEmbed, "dist")
	SPA = app.Instance.SPA(subfs.(fs.ReadDirFS))
}

var SPA http.Handler
