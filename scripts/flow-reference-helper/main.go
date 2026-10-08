// Built inside the pinned flow-go module by build-flow-reference-helper.sh.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/kodelyx/flow-go/flow-go/internal/app"
	"github.com/kodelyx/flow-go/flow-go/internal/cookiejar"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	file := flag.String("file", "", "local image")
	cookies := flag.String("cookies", "", "browser account snapshot")
	db := flag.String("db", "", "engine database")
	project := flag.String("project", "", "expected Flow project")
	account := flag.String("account", "", "expected browser account")
	flag.Parse()
	if *file == "" || *cookies == "" || *project == "" || *account == "" {
		return fmt.Errorf("file, cookies, account and project are required")
	}
	data, err := os.ReadFile(*file)
	if err != nil {
		return err
	}
	mime := http.DetectContentType(data)
	if mime != "image/png" && mime != "image/jpeg" && mime != "image/webp" {
		return fmt.Errorf("unsupported reference image type: %s", mime)
	}
	// File account keys and persisted engine identities are different namespaces.
	jar, err := cookiejar.LoadFile(*cookies)
	if err != nil {
		return err
	}
	if cookiejar.AccountKey(jar) != *account {
		return fmt.Errorf("Flow cookie account changed before reference sync; retry")
	}
	// A global ProjectID also overrides OTHER accounts registered at bootstrap.
	a, err := app.Build(app.Config{CookieFile: *cookies, DBPath: *db, CaptchaMode: "auto"})
	if err != nil {
		return err
	}
	defer a.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	// Best effort: use the live extension if no bridge already owns the port.
	go func() { _ = a.Bridge.Listen(ctx) }()
	if err := a.Engine.Bootstrap(ctx); err != nil {
		return err
	}
	if a.Engine.ProjectID() != *project || cookiejar.AccountKey(a.Engine.Jar()) != *account {
		return fmt.Errorf("Flow account/project changed during reference sync; retry")
	}
	media, content, err := a.Engine.UploadImageViaBatch(ctx, data, mime, filepath.Base(*file))
	if err != nil {
		return err
	}
	if media == "" {
		return fmt.Errorf("Flow upload returned no media ID")
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]string{
		"media_id":          media,
		"content_id":        content,
		"project_id":        a.Engine.ProjectID(),
		"account_id":        cookiejar.AccountKey(a.Engine.Jar()),
		"engine_account_id": a.Engine.AccountID(),
	})
}
