// Command server runs the fitdoing API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // ZONE works in minimal images

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/api"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := platform.LoadConfig(os.Getenv)
	if err != nil {
		return err
	}
	db, err := platform.OpenDB(cfg.DBDriver, cfg.DBDSN)
	if err != nil {
		return err
	}
	if err := api.Migrate(db); err != nil {
		return err
	}
	analyzer, err := ai.New(cfg.AIProvider, cfg.GeminiKey, cfg.GeminiModel)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.New(db, analyzer, platform.Clock{Loc: cfg.Zone}, cfg.CORSOrigins),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()
	slog.Info("listening", "addr", srv.Addr, "db", cfg.DBDriver, "ai", cfg.AIProvider)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
