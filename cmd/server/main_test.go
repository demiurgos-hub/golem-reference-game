package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/demiurgos-hub/golem-engine/golem"

	"github.com/demiurgos-hub/golem-reference-game/internal/generated"
)

// contractEnv lists every GOLEM_* variable the game reads (through the engine).
var contractEnv = []string{
	"GOLEM_ADDR", "GOLEM_HTTP_ADDR", "GOLEM_TLS_CERT_FILE", "GOLEM_TLS_KEY_FILE",
	"GOLEM_TLS_RELOAD_INTERVAL", "GOLEM_TLS_PINNED", "GOLEM_PUBLIC_URL",
	"GOLEM_WS_FALLBACK_URL", "GOLEM_WT_ALLOWED_ORIGINS", "GOLEM_TICK_RATE",
	"GOLEM_ADMIN_ADDR", "GOLEM_ADMIN_TOKEN", "GOLEM_SNAPSHOT_DIR",
	"GOLEM_SNAPSHOT_INTERVAL", "GOLEM_INSPECTOR_HUB_URL", "GOLEM_INSPECTOR_TOKEN",
	"GOLEM_INSPECTOR_TARGET_ID", "GOLEM_INSPECTOR_LABELS", "GOLEM_INSPECTOR_RATE_HZ",
}

// clearContractEnv blanks the contract variables (blank counts as unset) so a
// developer's shell cannot change the test.
func clearContractEnv(t *testing.T) {
	t.Helper()
	for _, name := range contractEnv {
		t.Setenv(name, "")
	}
}

// seededGame returns a game without networking and with its fresh world.
func seededGame(t *testing.T) *game {
	t.Helper()
	g := newGame(golem.ServerConfig{})
	if err := g.afterRestore(false); err != nil {
		t.Fatal(err)
	}
	return g
}

func toggleMessage(slot uint32) []byte {
	return (&generated.ClientMessage{Payload: &generated.ClientMessage_ToggleLanternCommand{
		ToggleLanternCommand: &generated.ToggleLanternCommand{Slot: slot},
	}}).Marshal()
}

func TestFreshWorldHasDarkLanternsOnTheRing(t *testing.T) {
	g := seededGame(t)
	if got := g.server.Len(); got != lanternCount+1 {
		t.Fatalf("fresh world has %d entities, want %d lanterns and the ring", got, lanternCount)
	}
	for slot, lantern := range g.lanterns {
		if lantern.Slot() != uint32(slot) || lantern.Lit() {
			t.Fatalf("lantern %d: slot %d lit %v", slot, lantern.Slot(), lantern.Lit())
		}
	}
	if g.ring.Switches() != 0 || g.ring.Visitors() != 0 {
		t.Fatal("fresh ring counters are not zero")
	}
}

func TestToggleCommandChangesSharedState(t *testing.T) {
	g := seededGame(t)
	if err := g.runtime.Commands.Dispatch(7, toggleMessage(2)); err != nil {
		t.Fatal(err)
	}
	if !g.lanterns[2].Lit() || g.ring.Switches() != 1 {
		t.Fatal("toggle did not light lantern 2 and count the switch")
	}
	// Any session may toggle any lantern.
	if err := g.runtime.Commands.Dispatch(8, toggleMessage(2)); err != nil {
		t.Fatal(err)
	}
	if g.lanterns[2].Lit() || g.ring.Switches() != 2 {
		t.Fatal("second toggle did not snuff lantern 2")
	}
}

func TestToggleRejectsUnknownSlot(t *testing.T) {
	g := seededGame(t)
	if err := g.toggle(lanternCount); !errors.Is(err, errUnknownSlot) {
		t.Fatalf("toggle(%d) = %v, want errUnknownSlot", lanternCount, err)
	}
	if g.ring.Switches() != 0 {
		t.Fatal("a rejected toggle was counted")
	}
}

func TestSnapshotRestoresLanternsAndSwitches(t *testing.T) {
	g := seededGame(t)
	g.setVisitors(3)
	for _, slot := range []uint32{1, 5} {
		if err := g.toggle(slot); err != nil {
			t.Fatal(err)
		}
	}
	path := filepath.Join(t.TempDir(), "world.snapshot")
	if err := <-g.runtime.SaveSnapshot(path); err != nil {
		t.Fatal(err)
	}

	restored := newGame(golem.ServerConfig{})
	ok, err := restored.runtime.LoadSnapshotIfExists(path)
	if err != nil || !ok {
		t.Fatalf("LoadSnapshotIfExists = %v, %v", ok, err)
	}
	if err := restored.afterRestore(true); err != nil {
		t.Fatal(err)
	}
	if got := restored.server.Len(); got != lanternCount+1 {
		t.Fatalf("restored world has %d entities, want %d", got, lanternCount+1)
	}
	for slot, lantern := range restored.lanterns {
		want := slot == 1 || slot == 5
		if lantern.Lit() != want {
			t.Fatalf("restored lantern %d lit = %v, want %v", slot, lantern.Lit(), want)
		}
	}
	if restored.ring.Switches() != 2 || restored.ring.Visitors() != 0 {
		t.Fatalf("restored ring switches %d visitors %d, want 2 and 0", restored.ring.Switches(), restored.ring.Visitors())
	}
}

func TestLocalDevelopmentDefaults(t *testing.T) {
	clearContractEnv(t)
	cfg := serverConfig("127.0.0.1:8080")
	if cfg.Transport != golem.TransportWebTransport || cfg.Addr != "127.0.0.1:8080" || !cfg.DevSelfSignedCert {
		t.Fatalf("local config = transport %q addr %q dev cert %v", cfg.Transport, cfg.Addr, cfg.DevSelfSignedCert)
	}
	rt := developmentRealtime(cfg)
	if rt.PublicURL != "https://127.0.0.1:8080/wt" || rt.WebSocketFallbackURL != "ws://127.0.0.1:8080/api/ws" {
		t.Fatalf("local realtime = %q, %q", rt.PublicURL, rt.WebSocketFallbackURL)
	}
}

func TestDeploymentGetsNoDevelopmentDefaults(t *testing.T) {
	clearContractEnv(t)
	t.Setenv("GOLEM_ADDR", ":7777")
	t.Setenv("GOLEM_HTTP_ADDR", ":7777")
	t.Setenv("GOLEM_TICK_RATE", "30")
	cfg := serverConfig("127.0.0.1:8080")
	if cfg.Addr != ":7777" || cfg.TickRate != 30 {
		t.Fatalf("env did not configure the server: addr %q tick %d", cfg.Addr, cfg.TickRate)
	}
	if cfg.DevSelfSignedCert {
		t.Fatal("a non-loopback address must not fall back to the development certificate")
	}
	if rt := developmentRealtime(cfg); rt != (golem.RealtimeConfigOptions{}) {
		t.Fatalf("non-loopback addresses advertised development URLs: %+v", rt)
	}

	t.Setenv("GOLEM_ADDR", "127.0.0.1:9443")
	t.Setenv("GOLEM_TLS_CERT_FILE", "cert.pem")
	t.Setenv("GOLEM_TLS_KEY_FILE", "key.pem")
	cfg = serverConfig("127.0.0.1:8080")
	if cfg.DevSelfSignedCert || cfg.TLSCertFile != "cert.pem" || cfg.TLSKeyFile != "key.pem" {
		t.Fatal("TLS files must replace the development certificate")
	}
}

// TestHostServesTheDeployContract runs the whole server the way Golem Deploy
// configures it, with only environment variables (on loopback, with the
// development certificate): WebTransport and the sidecar share one port
// number, the admin listener and snapshots are on, and a restart restores
// what the first run saved.
func TestHostServesTheDeployContract(t *testing.T) {
	clearContractEnv(t)
	port := freePort(t)
	adminPort := freePort(t)
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	adminAddr := fmt.Sprintf("127.0.0.1:%d", adminPort)
	snapshots := t.TempDir()
	assets := t.TempDir()
	if err := os.WriteFile(filepath.Join(assets, "index.html"), []byte("<title>Lantern Ring</title>"), 0o644); err != nil {
		t.Fatal(err)
	}
	const token = "reference-game-test-token"
	t.Setenv("GOLEM_ADDR", addr)
	t.Setenv("GOLEM_HTTP_ADDR", addr)
	t.Setenv("GOLEM_ADMIN_ADDR", adminAddr)
	t.Setenv("GOLEM_ADMIN_TOKEN", token)
	t.Setenv("GOLEM_SNAPSHOT_DIR", snapshots)

	// First run: change the world, save it through the admin API, stop.
	stop, done := startHost(t, assets)
	base := "http://" + addr
	admin := "http://" + adminAddr
	waitReady(t, admin, token)

	var realtime struct {
		Transport string `json:"transport"`
		URL       string `json:"url"`
		Hashes    []any  `json:"serverCertificateHashes"`
		Fallback  struct {
			Transport string `json:"transport"`
			URL       string `json:"url"`
		} `json:"fallback"`
	}
	getJSON(t, base+"/api/realtime-config", "", &realtime)
	if realtime.Transport != "webtransport" || realtime.URL != "https://"+addr+"/wt" || len(realtime.Hashes) == 0 ||
		realtime.Fallback.Transport != "websocket" || realtime.Fallback.URL != "ws://"+addr+"/api/ws" {
		t.Fatalf("realtime config = %+v", realtime)
	}
	if body := get(t, base+"/", "", http.StatusOK); !strings.Contains(body, "Lantern Ring") {
		t.Fatalf("web client not served: %q", body)
	}
	if body := get(t, base+"/some/client/route", "", http.StatusOK); !strings.Contains(body, "Lantern Ring") {
		t.Fatal("client routes do not fall back to index.html")
	}
	get(t, admin+"/info", "", http.StatusUnauthorized)
	var info struct {
		Name              string            `json:"name"`
		SchemaFingerprint string            `json:"schema_fingerprint"`
		Extra             map[string]string `json:"extra"`
	}
	getJSON(t, admin+"/info", token, &info)
	if info.Name != gameName || info.SchemaFingerprint != generated.SchemaFingerprint || info.Extra["snapshot_restored"] != "false" {
		t.Fatalf("admin info = %+v", info)
	}
	get(t, admin+"/stats", token, http.StatusOK)

	toggleOnTick(t, stop.game, 4)
	post(t, admin+"/snapshot", token, http.StatusOK)
	if _, err := os.Stat(filepath.Join(snapshots, "world.snapshot")); err != nil {
		t.Fatalf("POST /snapshot wrote no file: %v", err)
	}
	stop.cancel()
	if err := <-done; err != nil {
		t.Fatalf("first run: %v", err)
	}

	// Second run: the lantern is still lit and /info says so.
	stop, done = startHost(t, assets)
	waitReady(t, admin, token)
	getJSON(t, admin+"/info", token, &info)
	if info.Extra["snapshot_restored"] != "true" {
		t.Fatalf("second run did not restore: %+v", info)
	}
	lit := make(chan bool, 1)
	if err := stop.game.server.Post(func(*golem.Server) { lit <- stop.game.lanterns[4].Lit() && stop.game.ring.Switches() == 1 }); err != nil {
		t.Fatal(err)
	}
	if !<-lit {
		t.Fatal("lantern 4 and the switch count were not restored")
	}
	stop.cancel()
	if err := <-done; err != nil {
		t.Fatalf("second run: %v", err)
	}
}

type runningHost struct {
	game   *game
	cancel context.CancelFunc
}

// startHost runs the game like run does, keeping a handle on its state.
func startHost(t *testing.T, assets string) (runningHost, <-chan error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	cfg := serverConfig("127.0.0.1:8080")
	g := newGame(cfg)
	done := make(chan error, 1)
	go func() {
		done <- g.runtime.Host(ctx, generated.HostOptions{
			Name:         gameName,
			AssetsDir:    assets,
			Realtime:     developmentRealtime(cfg),
			AfterRestore: g.afterRestore,
		})
	}()
	t.Cleanup(cancel)
	return runningHost{game: g, cancel: cancel}, done
}

// toggleOnTick toggles a lantern on the tick goroutine, as a command would.
func toggleOnTick(t *testing.T, g *game, slot uint32) {
	t.Helper()
	result := make(chan error, 1)
	if err := g.server.Post(func(*golem.Server) { result <- g.toggle(slot) }); err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

// freePort returns a loopback port that is free for both TCP and UDP.
func freePort(t *testing.T) int {
	t.Helper()
	for range 20 {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		port := l.Addr().(*net.TCPAddr).Port
		u, err := net.ListenPacket("udp", fmt.Sprintf("127.0.0.1:%d", port))
		_ = l.Close()
		if err == nil {
			_ = u.Close()
			return port
		}
	}
	t.Fatal("no port free for both TCP and UDP")
	return 0
}

func waitReady(t *testing.T, admin, token string) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if code, _ := request(http.MethodGet, admin+"/ready", token); code == http.StatusOK {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("server did not become ready")
}

func request(method, url, token string) (int, string) {
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return 0, err.Error()
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func get(t *testing.T, url, token string, want int) string {
	t.Helper()
	code, body := request(http.MethodGet, url, token)
	if code != want {
		t.Fatalf("GET %s = %d %q, want %d", url, code, body, want)
	}
	return body
}

func post(t *testing.T, url, token string, want int) {
	t.Helper()
	if code, body := request(http.MethodPost, url, token); code != want {
		t.Fatalf("POST %s = %d %q, want %d", url, code, body, want)
	}
}

func getJSON(t *testing.T, url, token string, into any) {
	t.Helper()
	if err := json.Unmarshal([]byte(get(t, url, token, http.StatusOK)), into); err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
}
