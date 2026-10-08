package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kodelyx/flow-go/flow-go/internal/cookiejar"
)

func TestCookieAccountKeyIsNotEngineIdentity(t *testing.T) {
	jar := cookiejar.FromCookies([]cookiejar.Cookie{
		{Name: "SAPISID", Value: "fixture-session", Domain: ".google.com", Path: "/"},
	}, "fixture")
	key := cookiejar.AccountKey(jar)
	if key == "" {
		t.Fatal("expected a cookie account key")
	}
	// The engine persists another identity; never compare that to the filename.
	engineIdentity := "acct-persisted-different-id"
	if key == engineIdentity {
		t.Fatal("fixture must represent different identity namespaces")
	}
	file := filepath.Join(t.TempDir(), "account_"+key+".json")
	if err := (&cookiejar.Bundle{Cookies: jar.Cookies()}).Save(file); err != nil {
		t.Fatal(err)
	}
	loaded, err := cookiejar.LoadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if cookiejar.AccountKey(loaded) != key {
		t.Fatal("same session should pass the cookie-key comparison")
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
}
