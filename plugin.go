package caddyfile_editor

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"

	"github.com/Complexicon/caddyfile-editor/app"
	"github.com/Complexicon/caddyfile-editor/frontend"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/caddyserver/caddy/v2/caddyconfig/httpcaddyfile"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
	"golang.org/x/crypto/bcrypt"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func init() {
	caddy.RegisterModule(Middleware{})
	httpcaddyfile.RegisterHandlerDirective("admin_panel", func(h httpcaddyfile.Helper) (caddyhttp.MiddlewareHandler, error) {
		var m Middleware
		err := m.UnmarshalCaddyfile(h.Dispenser)
		return m, err
	})
}

// DOCS HOW2:
// https://caddyserver.com/docs/extending-caddy

type Middleware struct {
	echo              *echo.Echo
	AdminPasswordHash string `json:"adminPassHash,omitempty"`
}

func (Middleware) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.handlers.admin_panel",
		New: func() caddy.Module { return new(Middleware) },
	}
}

func (m *Middleware) Provision(ctx caddy.Context) error {

	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Recover())

	e.Use(middleware.BasicAuthWithConfig(middleware.BasicAuthConfig{
		Realm: "Caddyfile Editor",
		Validator: func(user, password string, ctx echo.Context) (bool, error) {
			err := bcrypt.CompareHashAndPassword([]byte(m.AdminPasswordHash), []byte(password))
			if subtle.ConstantTimeCompare([]byte(user), []byte("admin")) == 1 && err == nil {
				return true, nil
			}
			return false, nil
		},
	}))

	// serve frontend (either embedded files or dev server depending on build tags)
	e.GET("/*", echo.WrapHandler(frontend.SPA), middleware.Gzip())

	// attach RPC endpoints under /rpc
	backend := e.Group("/rpc")
	app.AppStruct.Log = ctx.Logger()
	app.Instance.Attach(backend)

	m.echo = e

	return nil
}

func (m *Middleware) Validate() error {
	if !strings.HasPrefix(m.AdminPasswordHash, "$2") {
		return fmt.Errorf("not a bcrypt hash")
	}

	return nil
}

func (m Middleware) ServeHTTP(w http.ResponseWriter, r *http.Request, next caddyhttp.Handler) error {
	m.echo.ServeHTTP(w, r)
	return nil
}

func (m *Middleware) UnmarshalCaddyfile(d *caddyfile.Dispenser) error {
	d.Next()

	if !d.NextArg() {
		return d.ArgErr()
	}

	if d.Val() != "bcrypt" { // only support bcrypt for now
		return d.ArgErr()
	}

	if !d.NextArg() {
		return d.ArgErr()
	}

	m.AdminPasswordHash = d.Val()

	if m.AdminPasswordHash == "" {
		return d.ArgErr()
	}

	return nil
}

var (
	_ caddy.Provisioner           = (*Middleware)(nil)
	_ caddy.Validator             = (*Middleware)(nil)
	_ caddyhttp.MiddlewareHandler = (*Middleware)(nil)
	_ caddyfile.Unmarshaler       = (*Middleware)(nil)
)
