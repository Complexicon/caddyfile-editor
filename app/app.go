package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/labstack/echo/v4"
	"github.com/molpeDE/spark/pkg/framework"
	"go.uber.org/zap"
)

// todo: global rw mutex? since there can be multiple admin_panels running

type App struct {
	Log      *zap.Logger
	ConfPath string
}

var AppStruct = &App{}
var Instance = framework.CreateApp(AppStruct)

type AdaptResult struct {
	Body       string `json:"-"`
	Warnings   []caddyconfig.Warning
	AdaptError string `json:",omitempty"`
}

var ConfigAutosavePath = filepath.Join(caddy.AppConfigDir(), "autosave.Caddyfile")

func (a *App) LastCaddyfile(c echo.Context) (string, error) {
	path := ConfigAutosavePath

	if a.ConfPath != "" {
		path = a.ConfPath
	}

	content, err := os.ReadFile(path)

	if err != nil {
		return "", err
	}

	return string(content), nil
}

func (a *App) AdaptCaddyfile(c echo.Context, caddyfile_content string) (AdaptResult, error) {
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

func (a *App) InstallCaddyfile(c echo.Context, caddyfile_content string) (bool, error) {
	adaptationResult, _ := a.AdaptCaddyfile(c, caddyfile_content)

	if adaptationResult.AdaptError != "" {
		return false, fmt.Errorf("adapt failed: %s", adaptationResult.AdaptError)
	}

	a.Log.Info("installing caddyfile per user request...")
	caddyfile_content = string(caddyfile.Format([]byte(caddyfile_content)))
	os.WriteFile(ConfigAutosavePath, []byte(caddyfile_content), os.ModePerm)

	if a.ConfPath != "" {
		os.WriteFile(a.ConfPath, []byte(caddyfile_content), os.ModePerm)
	}

	return true, caddy.Load([]byte(adaptationResult.Body), false)
}
