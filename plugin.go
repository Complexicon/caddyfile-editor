package caddyfile_editor

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Complexicon/caddyfile-editor/frontend"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/caddyserver/caddy/v2/caddyconfig/httpcaddyfile"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
)

func init() {
	caddy.RegisterModule(CaddyfileEditor{})
	httpcaddyfile.RegisterHandlerDirective("admin_panel", func(h httpcaddyfile.Helper) (caddyhttp.MiddlewareHandler, error) {
		var m CaddyfileEditor
		err := m.UnmarshalCaddyfile(h.Dispenser)
		return m, err
	})
	httpcaddyfile.RegisterDirectiveOrder("admin_panel", httpcaddyfile.Before, "respond")
}

// DOCS HOW2:
// https://caddyserver.com/docs/extending-caddy

type CaddyfileEditor struct {
	AdminPasswordHash string `json:"adminPassHash,omitempty"`
	AuthMethod        string `json:"authMethod,omitempty"`
	log               *zap.Logger
	confPath          string
	handler           http.Handler
}

func (CaddyfileEditor) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.handlers.admin_panel",
		New: func() caddy.Module { return new(CaddyfileEditor) },
	}
}

func (m *CaddyfileEditor) Provision(ctx caddy.Context) error {

	m.log = ctx.Logger()
	mux := http.NewServeMux()

	fail := func(w http.ResponseWriter, err error) {
		w.Header().Set("content-type", "text/plain")
		w.WriteHeader(http.StatusInternalServerError)
		io.WriteString(w, err.Error())
	}

	mux.HandleFunc("POST /install", func(w http.ResponseWriter, r *http.Request) {
		content, err := io.ReadAll(r.Body)
		if err != nil {
			fail(w, err)
			return
		}

		if _, err := m.InstallCaddyfile(string(content)); err != nil {
			fail(w, err)
			return
		}

		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("POST /adapt", func(w http.ResponseWriter, r *http.Request) {
		content, err := io.ReadAll(r.Body)
		if err != nil {
			fail(w, err)
			return
		}

		if r, err := m.AdaptCaddyfile(string(content)); err != nil {
			fail(w, err)
			return
		} else {
			w.Header().Set("content-type", "application/json")
			w.WriteHeader(http.StatusAccepted)
			json.NewEncoder(w).Encode(r)
		}
	})

	mux.HandleFunc("GET /last", func(w http.ResponseWriter, r *http.Request) {
		caddyfile, err := m.LastCaddyfile()

		if err != nil {
			fail(w, err)
			return
		}

		w.Header().Set("content-type", "text/plain")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, caddyfile)
	})

	mux.Handle("GET /{path...}", frontend.Serve)

	if m.AuthMethod == "bcrypt" {
		m.handler = m.basicAuth(mux)
	} else {
		m.handler = mux
	}

	return nil
}

func probeFile(path string) bool {
	var canRead, canWrite bool
	if f, err := os.Open(path); err == nil {
		canRead = true
		f.Close()
	}

	if f, err := os.OpenFile(path, os.O_WRONLY, 0); err == nil {
		canWrite = true
		f.Close()
	}

	return canRead && canWrite
}

func (m *CaddyfileEditor) Validate() error {

	// hack since caddy.getLastConfig is not exposed
	prevWasCfgFlag := false
	confFile := ""
	for _, v := range os.Args {

		if prevWasCfgFlag {
			confFile = v
			break
		}

		prevWasCfgFlag = v == "-c" || v == "--config"
	}
	if confFile != "" && !filepath.IsAbs(confFile) {
		confFile, _ = filepath.Abs(confFile)
	}

	if confFile != "" {
		if probeFile(confFile) {
			m.log.Info("using specified config file as write destination", zap.String("file", confFile))
			m.confPath = confFile
		} else {
			m.log.Warn("specified config file not writable! falling back to cached file", zap.String("file", confFile), zap.String("cachefile", ConfigAutosavePath))
		}

	} else {
		m.log.Info("using cache config file as write destination", zap.String("file", ConfigAutosavePath))
	}

	return nil
}

func (m CaddyfileEditor) ServeHTTP(w http.ResponseWriter, r *http.Request, next caddyhttp.Handler) error {
	m.handler.ServeHTTP(w, r)
	return nil
}

func (m *CaddyfileEditor) UnmarshalCaddyfile(d *caddyfile.Dispenser) error {
	d.Next()

	if !d.NextArg() {
		return d.ArgErr()
	}

	m.AuthMethod = d.Val()

	switch m.AuthMethod {
	case "bcrypt":
		if !d.NextArg() {
			return d.ArgErr()
		}

		m.AdminPasswordHash = d.Val()

		if !strings.HasPrefix(m.AdminPasswordHash, "$2") {
			return fmt.Errorf("not a bcrypt hash")
		}

	case "no_password":
		break
	default:
		return d.ArgErr()
	}

	if m.AuthMethod == "bcrypt" && m.AdminPasswordHash == "" {
		return d.ArgErr()
	}

	return nil
}

var (
	_ caddy.Provisioner           = (*CaddyfileEditor)(nil)
	_ caddy.Validator             = (*CaddyfileEditor)(nil)
	_ caddyhttp.MiddlewareHandler = (*CaddyfileEditor)(nil)
	_ caddyfile.Unmarshaler       = (*CaddyfileEditor)(nil)
)

func (c *CaddyfileEditor) basicAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()

		passOK := bcrypt.CompareHashAndPassword([]byte(c.AdminPasswordHash), []byte(pass)) == nil
		userOK := subtle.ConstantTimeCompare([]byte(user), []byte("admin")) == 1

		if !ok || !userOK || !passOK {
			w.Header().Set("WWW-Authenticate", `Basic realm="restricted", charset="UTF-8"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

type AdaptResult struct {
	Body       string `json:"-"`
	Warnings   []caddyconfig.Warning
	AdaptError string `json:",omitempty"`
}

var ConfigAutosavePath = filepath.Join(caddy.AppConfigDir(), "autosave.Caddyfile")

func (a *CaddyfileEditor) LastCaddyfile() (string, error) {
	path := ConfigAutosavePath

	if a.confPath != "" {
		path = a.confPath
	}

	content, err := os.ReadFile(path)

	if err != nil {
		return "", err
	}

	return string(content), nil
}

func (a *CaddyfileEditor) AdaptCaddyfile(caddyfile_content string) (AdaptResult, error) {
	result, warnings, err := caddyconfig.GetAdapter("caddyfile").Adapt([]byte(caddyfile_content), nil)

	out := AdaptResult{
		Body:     string(result),
		Warnings: warnings,
	}

	if err != nil {
		out.AdaptError = err.Error()
	} else {

		hasValidAdminPanel := false

		// check if config contains atleast one admin_panel directive
		// that is not commented out, else warn user over possibly losing access
		for line := range strings.SplitSeq(caddyfile_content, "\n") {
			if before, _, found := strings.Cut(line, "admin_panel"); found && !strings.ContainsRune(before, '#') {
				hasValidAdminPanel = true
				break
			}
		}

		if !hasValidAdminPanel {
			out.Warnings = append(out.Warnings, caddyconfig.Warning{
				File:      "Caddyfile",
				Line:      0,
				Directive: "HACK_WHOLEFILE",
				Message:   "no valid admin_panel directive present, possible self-lockout if applied!",
			})
		}

	}

	return out, nil
}

func (a *CaddyfileEditor) InstallCaddyfile(caddyfile_content string) (bool, error) {
	adaptationResult, _ := a.AdaptCaddyfile(caddyfile_content)

	if adaptationResult.AdaptError != "" {
		return false, fmt.Errorf("adapt failed: %s", adaptationResult.AdaptError)
	}

	a.log.Info("installing caddyfile per user request...")
	caddyfile_content = string(caddyfile.Format([]byte(caddyfile_content)))
	os.WriteFile(ConfigAutosavePath, []byte(caddyfile_content), os.ModePerm)

	if a.confPath != "" {
		os.WriteFile(a.confPath, []byte(caddyfile_content), os.ModePerm)
	}

	return true, caddy.Load([]byte(adaptationResult.Body), false)
}
