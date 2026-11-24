// Command server runs Lantern Ring, the Golem Deploy reference game: eight
// lanterns on a ring that any player can light or snuff. The lanterns and the
// ring's switch counter are the shared world; with a snapshot directory they
// survive restarts.
//
// One process hosts everything through the Golem Engine deploy contract
// (golem.ServerConfigFromEnv and the generated Runtime.Host): the game over
// WebTransport with a WebSocket fallback, and a sidecar HTTP(S) server that
// serves the web client, the realtime config and the WebSocket endpoint, so the
// browser reaches the page and both transports on one origin and port.
//
// With no GOLEM_* variables it runs for local development on -addr (default
// 127.0.0.1:8080, WebTransport on UDP and the web client on TCP) with the
// engine's generated development certificate. Deployments configure it only
// through GOLEM_* variables; see README.md for the full table.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"net"
	"os"
	"strings"

	"github.com/demiurgos-hub/golem-engine/golem"
	"github.com/demiurgos-hub/golem-engine/golem/host"

	"github.com/demiurgos-hub/golem-reference-game/internal/generated"
)

const (
	gameName = "lantern-ring"
	// lanternCount is the number of lanterns on the ring, slots 0 to 7.
	lanternCount = 8
	ringRadius   = 3.0
	// webTransportPath is the WebTransport endpoint on the game address.
	webTransportPath = "/wt"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080",
		"local development address for WebTransport (UDP) and the web client (TCP); "+
			golem.EnvAddr+" and "+host.EnvHTTPAddr+" override it")
	assets := flag.String("assets", "web/dist", "built web client directory, relative to the working directory")
	flag.Parse()
	if err := run(context.Background(), *addr, *assets); err != nil {
		log.Fatal(err)
	}
}

// run hosts the game until ctx is cancelled or SIGINT/SIGTERM arrives.
func run(ctx context.Context, addr, assets string) error {
	cfg := serverConfig(addr)
	g := newGame(cfg)
	if _, err := os.Stat(assets); err != nil {
		log.Printf("%s: web client not found at %q (run npm run build); the realtime endpoints still work", gameName, assets)
	}
	return g.runtime.Host(ctx, generated.HostOptions{
		Name:         gameName,
		HTTPAddr:     addr,
		AssetsDir:    assets,
		Realtime:     developmentRealtime(cfg),
		AfterRestore: g.afterRestore,
	})
}

// serverConfig returns the server configuration: WebTransport on addr unless
// GOLEM_ADDR and the other golem.ServerConfigFromEnv variables say otherwise.
// The engine's in-memory development certificate is used only when no TLS
// files are configured and the address is loopback, so a deployment that
// forgets its certificate fails to start instead of serving a throwaway one.
func serverConfig(addr string) golem.ServerConfig {
	cfg := golem.ServerConfigFromEnv(golem.ServerConfig{
		TickRate:  20,
		Addr:      addr,
		Transport: golem.TransportWebTransport,
		Path:      webTransportPath,
	})
	cfg.DevSelfSignedCert = cfg.TLSCertFile == "" && cfg.TLSKeyFile == "" && isLoopbackAddr(cfg.Addr)
	return cfg
}

// developmentRealtime returns the base realtime config. For a loopback game
// address it advertises the local endpoints (WebTransport on the game address,
// the WebSocket fallback on the sidecar); otherwise it is empty and the
// deployment must set GOLEM_PUBLIC_URL and GOLEM_WS_FALLBACK_URL, which
// Runtime.Host overlays on this base. The engine itself never invents URLs.
func developmentRealtime(cfg golem.ServerConfig) golem.RealtimeConfigOptions {
	var rt golem.RealtimeConfigOptions
	if isLoopbackAddr(cfg.Addr) {
		rt.PublicURL = "https://" + cfg.Addr + webTransportPath
	}
	sidecar := cfg.Addr
	if v := strings.TrimSpace(os.Getenv(host.EnvHTTPAddr)); v != "" {
		sidecar = v
	}
	if isLoopbackAddr(sidecar) {
		scheme := "ws"
		if strings.TrimSpace(os.Getenv(golem.EnvTLSCertFile)) != "" {
			scheme = "wss"
		}
		rt.WebSocketFallbackURL = scheme + "://" + sidecar + host.DefaultWebSocketPath
	}
	return rt
}

// isLoopbackAddr reports whether a host:port address names a loopback host.
func isLoopbackAddr(addr string) bool {
	h, _, err := net.SplitHostPort(addr)
	if err != nil || h == "" {
		return false
	}
	if strings.EqualFold(h, "localhost") {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// game is the server-side state: the ring counters and the lanterns by slot.
// All of it is touched only on the tick goroutine (hooks and commands).
type game struct {
	server   *golem.Server
	runtime  *generated.Runtime
	ring     *generated.SyncedRing
	lanterns [lanternCount]*generated.SyncedLantern
	visitors int32
}

// newGame wires the server and its hooks without creating entities, so a
// snapshot can be restored before the world is seeded (see afterRestore).
func newGame(cfg golem.ServerConfig) *game {
	srv, rt := generated.NewServer(cfg)
	g := &game{server: srv, runtime: rt}
	srv.OnConnect(func(*golem.Session) { g.setVisitors(g.visitors + 1) })
	srv.OnDisconnect(func(*golem.Session) { g.setVisitors(g.visitors - 1) })
	rt.Commands.OnToggleLantern(func(senderID int64, cmd *generated.ToggleLanternCommand) {
		if err := g.toggle(cmd.Slot); err != nil {
			log.Printf("session %d: %v", senderID, err)
		}
	})
	rt.Commands.BindAllHandlers(func(sess *golem.Session, err error) {
		log.Printf("session %d command: %v", sess.ID, err)
	})
	return g
}

// afterRestore seeds a fresh world, or adopts the restored ring and lanterns
// when a snapshot was loaded. Missing pieces (for example a lantern slot added
// after the snapshot was taken) are created dark.
func (g *game) afterRestore(restored bool) error {
	if restored {
		for _, e := range g.server.All() {
			switch v := e.(type) {
			case *generated.SyncedRing:
				g.ring = v
			case *generated.SyncedLantern:
				if slot := v.Slot(); slot < lanternCount && g.lanterns[slot] == nil {
					g.lanterns[slot] = v
				}
			}
		}
	}
	if g.ring == nil {
		g.ring = generated.NewSyncedRing(0, 0, 0, 0, 0)
		if err := g.server.CreateEntity(g.ring); err != nil {
			return fmt.Errorf("create ring: %w", err)
		}
	}
	g.ring.SetVisitors(0)
	for slot := range g.lanterns {
		if g.lanterns[slot] != nil {
			continue
		}
		angle := 2 * math.Pi * float64(slot) / lanternCount
		x, z := float32(math.Cos(angle)*ringRadius), float32(math.Sin(angle)*ringRadius)
		lantern := generated.NewSyncedLantern(x, 0, z, uint32(slot), false)
		if err := g.server.CreateEntity(lantern); err != nil {
			return fmt.Errorf("create lantern %d: %w", slot, err)
		}
		g.lanterns[slot] = lantern
	}
	return nil
}

// errUnknownSlot is returned for a toggle of a slot that has no lantern.
var errUnknownSlot = errors.New("no lantern in that slot")

// toggle lights or snuffs the lantern in slot and counts the switch.
func (g *game) toggle(slot uint32) error {
	if slot >= lanternCount || g.lanterns[slot] == nil {
		return fmt.Errorf("toggle lantern %d: %w", slot, errUnknownSlot)
	}
	lantern := g.lanterns[slot]
	lantern.SetLit(!lantern.Lit())
	g.ring.SetSwitches(g.ring.Switches() + 1)
	return nil
}

func (g *game) setVisitors(n int32) {
	g.visitors = n
	if g.ring != nil {
		g.ring.SetVisitors(n)
	}
}
