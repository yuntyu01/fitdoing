// Command server runs the fitdoing API.
package main

import (
	"bytes"
	"context"
	"errors"
	"github.com/google/uuid"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // ZONE works in minimal images

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/api"
	"github.com/yuntyu01/fitdoing/server/internal/auth"
	"github.com/yuntyu01/fitdoing/server/internal/foods"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/places"
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
	// one analyzer per allowed model: GEMINI_MODEL (default) + GEMINI_MODELS (assigned per user by an admin)
	names := append([]string{cfg.GeminiModel}, cfg.GeminiExtra...)
	analyzers := map[string]ai.FoodAnalyzer{}
	for _, name := range names {
		a, err := ai.New(cfg.AIProvider, cfg.GeminiKey, name)
		if err != nil {
			return err
		}
		analyzers[name] = a
	}
	models, err := ai.NewModelSet(db, cfg.GeminiModel, names, analyzers)
	if err != nil {
		return err
	}
	analyzer := analyzers[cfg.GeminiModel]
	authSvc := auth.NewService(db, cfg.AuthSecret, map[auth.Provider]auth.Verifier{
		auth.Kakao:  &auth.KakaoVerifier{AppID: cfg.KakaoAppID, URL: cfg.KakaoInfoURL},
		auth.Google: auth.NewGoogle(cfg.GoogleClientIDs),
		auth.Apple:  auth.NewApple(cfg.AppleClientID),
	}, nil)
	authSvc.KakaoEvents = auth.NewKakaoEventVerifier(cfg.KakaoAppID, cfg.KakaoRESTKey)
	if cfg.AuthDisabled {
		slog.Warn("AUTH_DISABLED=1: legacy test devices and verified provider sessions accepted; upgraded device tokens retired")
	}
	storedPhotos := photoStore(cfg)
	if lister, ok := storedPhotos.(photo.PrefixLister); ok {
		probeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, probeErr := lister.ListPrefix(probeCtx, "u/__fitdoing_capability_probe__/")
		cancel()
		slog.Info("photo prefix cleanup capability", "available", probeErr == nil)
		// Only a newly generated, non-user probe object is written and removed.
		probeKey := "u/__fitdoing_capability_probe__/probe_" + uuid.NewString() + ".bin"
		probeData := []byte("fitdoing storage capability check")
		probeCtx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
		writeErr := storedPhotos.Put(probeCtx, probeKey, probeData, "application/octet-stream")
		var readData []byte
		var readErr error
		if writeErr == nil {
			readData, readErr = storedPhotos.Get(probeCtx, probeKey)
		}
		cancel()
		deleteCtx, deleteCancel := context.WithTimeout(context.Background(), 5*time.Second)
		deleteErr := storedPhotos.Delete(deleteCtx, probeKey)
		var missingErr error
		if deleteErr == nil {
			_, missingErr = storedPhotos.Get(deleteCtx, probeKey)
		}
		deleteCancel()
		slog.Info("isolated photo storage roundtrip", "available", writeErr == nil && readErr == nil && bytes.Equal(readData, probeData) && deleteErr == nil && errors.Is(missingErr, photo.ErrNotFound))
	}
	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: api.New(db, analyzer, platform.Clock{Loc: cfg.Zone}, cfg.CORSOrigins, authSvc, api.Options{
			AuthDisabled:  cfg.AuthDisabled,
			AIModels:      models,
			AdminPassword: cfg.AdminPassword,
			Places:        places.New(cfg.KakaoRESTKey, cfg.KakaoLocalURL),
			Foods:         foods.New(cfg.FoodSafetyKey, cfg.DataGoKrKey, cfg.FoodSafetyURL, cfg.DataGoKrURL),
			PhotoStore:    storedPhotos,
			PublicURL:     cfg.PublicURL,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	workerContext, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	go authSvc.RunKakaoDeletions(workerContext)
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()
	slog.Info("listening", "addr", srv.Addr, "db", cfg.DBDriver, "ai", cfg.AIProvider, "models", names,
		"admin", cfg.AdminPassword != "", "places", cfg.KakaoRESTKey != "",
		"barcode", cfg.FoodSafetyKey != "" && cfg.DataGoKrKey != "")
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// photoStore picks where backed-up meal photos go (PHOTO_STORE). nil = photo backup off.
func photoStore(cfg platform.Config) photo.Store {
	switch cfg.PhotoStore {
	case "file":
		slog.Info("photo backup: local directory", "dir", cfg.PhotoDir)
		return photo.FileStore{Dir: cfg.PhotoDir}
	case "r2":
		slog.Info("photo backup: Cloudflare R2", "bucket", cfg.R2Bucket)
		return &photo.R2Store{Endpoint: cfg.R2Endpoint, Bucket: cfg.R2Bucket, AccessKey: cfg.R2AccessKey,
			SecretKey: cfg.R2SecretKey, Region: "auto"}
	}
	return nil
}
