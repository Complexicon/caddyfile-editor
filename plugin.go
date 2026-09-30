package caddyfile_editor

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Complexicon/caddyfile-editor/frontend"
	"go.uber.org/zap"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/caddyserver/caddy/v2/caddyconfig/httpcaddyfile"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
)

// https://caddyserver.com/docs/extending-caddy
func init() {
	caddy.RegisterModule(CaddyfileEditor{})
	httpcaddyfile.RegisterHandlerDirective("caddyfile_editor", func(h httpcaddyfile.Helper) (caddyhttp.MiddlewareHandler, error) { return &CaddyfileEditor{}, nil })
	httpcaddyfile.RegisterDirectiveOrder("caddyfile_editor", httpcaddyfile.Before, "respond")
}

type CaddyfileEditor struct {
	log      *zap.Logger
	confPath string
	handler  http.Handler
}

var (
	_ caddy.Provisioner           = (*CaddyfileEditor)(nil)
	_ caddy.Validator             = (*CaddyfileEditor)(nil)
	_ caddyhttp.MiddlewareHandler = (*CaddyfileEditor)(nil)
)

func (CaddyfileEditor) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.handlers.caddyfile_editor",
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

	m.handler = mux

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

func (m *CaddyfileEditor) ServeHTTP(w http.ResponseWriter, r *http.Request, next caddyhttp.Handler) error {
	m.handler.ServeHTTP(w, r)
	return nil
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

		hasCaddyfileEditorDirective := false

		// check if config contains atleast one caddyfile_editor directive that is not commented out
		// else warn user over possibly losing access
		for line := range strings.SplitSeq(caddyfile_content, "\n") {
			if before, _, found := strings.Cut(line, "caddyfile_editor"); found && !strings.ContainsRune(before, '#') {
				hasCaddyfileEditorDirective = true
				break
			}
		}

		if !hasCaddyfileEditorDirective {
			out.Warnings = append(out.Warnings, caddyconfig.Warning{
				File:      "Caddyfile",
				Line:      0,
				Directive: "HACK_WHOLEFILE",
				Message:   "no valid caddyfile_editor directive present, possible self-lockout if applied!",
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
