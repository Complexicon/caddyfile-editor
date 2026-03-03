package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig"
	"github.com/labstack/echo/v4"
	"github.com/molpeDE/spark/pkg/framework"
	"go.uber.org/zap"
)

type App struct {
	Log *zap.Logger
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
	content, err := os.ReadFile(ConfigAutosavePath)

	if err != nil {
		return "", err
	}

	return string(content), nil
}

func (a *App) AdaptCaddyfile(c echo.Context, caddyfile string) (AdaptResult, error) {
	result, warnings, err := caddyconfig.GetAdapter("caddyfile").Adapt([]byte(caddyfile), nil)

	out := AdaptResult{
		Body:     string(result),
		Warnings: warnings,
	}

	if err != nil {
		out.AdaptError = err.Error()
	} else {

		hasValidAdminPanel := false

		/*
			check if config contains atleast one admin_panel directive
			that is not commented out, else warn user over possibly losing access
		*/
		for line := range strings.SplitSeq(caddyfile, "\n") {
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

func (a *App) InstallCaddyfile(c echo.Context, caddyfile string) (bool, error) {
	adaptationResult, _ := a.AdaptCaddyfile(c, caddyfile)

	if adaptationResult.AdaptError != "" {
		return false, fmt.Errorf("adapt failed: %s", adaptationResult.AdaptError)
	}

	a.Log.Warn(fmt.Sprintf("installed caddyfile per user request, copy at %s", ConfigAutosavePath))
	os.WriteFile(ConfigAutosavePath, []byte(caddyfile), os.ModePerm)
	return true, caddy.Load([]byte(adaptationResult.Body), false)
}
