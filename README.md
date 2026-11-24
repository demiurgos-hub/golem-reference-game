# Lantern Ring: the Golem Deploy reference game

Lantern Ring is a tiny multiplayer game built on [Golem Engine](https://golemengine.dev). Eight lanterns stand on a ring, and any player can light or snuff any of them. Everyone connected sees the change straight away, and with a snapshot directory configured the ring remembers which lanterns are lit, and how many times they were switched, across server restarts.

It exists to be deployed. It is the fixture for the end-to-end checks of [Golem Deploy](https://github.com/demiurgos-hub/golem-deploy), and an example to copy when you make your own game deployable: it depends only on released Golem Engine packages, commits its generated code, and is configured entirely through the engine's deploy environment contract.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## Layout

```text
cmd/server/            the game server (main.go) and its tests
schemas/               entity and command schemas (input to golem-bake)
golem.yaml             golem-bake configuration
internal/generated/    generated Go server code (committed)
web/                   the browser client (Svelte 5 + Threlte)
  src/generated/       generated TypeScript client and Threlte bindings (committed)
  dist/                built client served by the server (not committed)
test/browser/          Playwright test
scripts/go.mjs         runs Go for the npm scripts (GOWORK=off, local tools on PATH)
```

The world is two schemas:

- `Lantern` (`slot`, `lit`): eight persistent entities, one per slot.
- `Ring` (`switches`, `visitors`): one global entity replicated to every session. `switches` survives restarts; `visitors` is reset when the world is restored.

The `ToggleLantern { slot }` command flips one lantern and counts the switch.

## Requirements

- Go 1.25.4 or newer
- Node.js 24 and npm

## Run it locally

```sh
npm ci
npm run build      # type-checks and builds web/dist
npm run server     # go run ./cmd/server
```

Open <http://127.0.0.1:8080> in two browser windows and light a lantern.

With no `GOLEM_*` variables the server listens on `127.0.0.1:8080` (change it with `-addr`): WebTransport on UDP and the web client, realtime config and WebSocket fallback on TCP. WebTransport uses the engine's in-memory development certificate (`golem.ServerConfig.DevSelfSignedCert`), whose SHA-256 hash the realtime config publishes so the browser pins it; nothing has to be installed or trusted. The page itself is plain HTTP, which browsers treat as secure on `127.0.0.1`. Browsers without WebTransport use the WebSocket fallback.

The development certificate and the development URLs are used only when the game address is loopback. On any other address the server needs TLS files and `GOLEM_PUBLIC_URL`; without a certificate it refuses to start, and without a public URL the realtime config answers 503.

To keep the world between local runs, add a snapshot directory, and an admin listener if you want to look inside:

```sh
GOLEM_SNAPSHOT_DIR=data GOLEM_ADMIN_ADDR=127.0.0.1:9090 npm run server
curl http://127.0.0.1:9090/info    # no token needed on loopback
```

Stop the server with Ctrl+C (SIGINT) or SIGTERM to save the final snapshot. On Windows, a process that is killed rather than interrupted gets no signal; call `POST /snapshot` on the admin listener first.

Other commands:

| Command | What it does |
|---------|--------------|
| `npm run generate` | Regenerate code after changing `schemas/` or `golem.yaml` (`go tool golem-bake`) |
| `npm run generate:check` | Verify the committed generated code is current (`golem-bake --check`) |
| `npm run test:server` | `go test ./...` |
| `npm run test:browser` | Playwright, over WebTransport and over the WebSocket fallback; starts the server unless `PLAYWRIGHT_BASE_URL` is set |
| `npm run dev` | Vite dev server on :5173 for UI work, proxying `/api` to a running server (WebSocket fallback only) |

`golem-bake` is pinned as a Go tool in `go.mod`, so it always matches the engine version the server is built with. Run it after `npm ci`: the TypeScript client is compiled with the project's own `typescript`.

The browser test uses Playwright's Chromium. To use an installed Chrome instead, set `PLAYWRIGHT_CHANNEL=chrome`. The fallback test hides the `WebTransport` API from the page so the client takes the WebSocket path, as an older browser would.

## Environment contract

The server reads only these variables, all through the engine (`golem.ServerConfigFromEnv`, `golem.RealtimeConfigOptionsFromEnv` and the generated `Runtime.Host`). Unset or blank variables keep the local default; malformed values are logged and ignored.

| Variable | Default | Meaning |
|----------|---------|---------|
| `GOLEM_ADDR` | `-addr` (`127.0.0.1:8080`) | WebTransport listen address (UDP), e.g. `:7777` |
| `GOLEM_HTTP_ADDR` | `-addr` (`127.0.0.1:8080`) | Sidecar listen address (TCP): web client, `/api/realtime-config`, WebSocket fallback at `/api/ws` |
| `GOLEM_TLS_CERT_FILE`, `GOLEM_TLS_KEY_FILE` | development certificate on loopback | PEM pair for WebTransport and the sidecar (which then serves HTTPS) |
| `GOLEM_TLS_RELOAD_INTERVAL` | `0` (off) | Poll the TLS files and reload them when they change (Go duration, e.g. `1m`) |
| `GOLEM_TLS_PINNED` | off for files, on for the development certificate | `1` publishes the certificate's hashes in the realtime config, so browsers can pin a short-lived self-signed certificate |
| `GOLEM_PUBLIC_URL` | `https://<addr>/wt` on loopback | WebTransport URL browsers connect to, e.g. `https://game.example.com:7001/wt` |
| `GOLEM_WS_FALLBACK_URL` | `ws://<http addr>/api/ws` on loopback | WebSocket fallback URL, e.g. `wss://game.example.com:7001/api/ws` |
| `GOLEM_WT_ALLOWED_ORIGINS` | none | Extra browser origins allowed to connect (comma-separated); same-origin pages need no entry |
| `GOLEM_TICK_RATE` | `20` | Ticks per second |
| `GOLEM_ADMIN_ADDR` | off | Admin listener address, e.g. `:9090` |
| `GOLEM_ADMIN_TOKEN` | none | Admin bearer token (at least 16 characters); required unless the admin address is loopback |
| `GOLEM_SNAPSHOT_DIR` | off | Directory for `world.snapshot`: loaded at start, saved on SIGINT/SIGTERM and by admin `POST /snapshot` |
| `GOLEM_SNAPSHOT_INTERVAL` | `0` (off) | Autosave period (Go duration, e.g. `5m`) |
| `GOLEM_INSPECTOR_HUB_URL` | off | Golem Inspector hub agent endpoint; enables the inspector agent |
| `GOLEM_INSPECTOR_TOKEN`, `GOLEM_INSPECTOR_TARGET_ID`, `GOLEM_INSPECTOR_LABELS`, `GOLEM_INSPECTOR_RATE_HZ` | | Inspector token, server name (default: host name), `k=v,k=v` labels, update rate (default 10) |

The admin listener serves `GET /live` (no token), `GET /ready`, `GET /info` (game name, schema fingerprint, snapshot file and whether it was restored), `GET /stats`, `POST /snapshot` and `POST /reload-tls`.

A snapshot saved by a build with different schemas stops the server at startup with both schema fingerprints in the error, instead of silently starting an empty world. Move the file away to start fresh.

## Deploy it with Golem Deploy

Golem Deploy clones this repository, builds it inside `docker build` (`npm ci`, `golem-bake --check`, `npm run build`, `CGO_ENABLED=0 go build ./cmd/server`, a distroless image with the binary and `web/dist` in `/app`) and runs it as a hardened container: read-only root filesystem, non-root user 65532, no capabilities, one host port published as both UDP and TCP to port 7777 in the container. It configures the game only through the variables above, along these lines:

```sh
GOLEM_ADDR=:7777
GOLEM_HTTP_ADDR=:7777
GOLEM_TLS_CERT_FILE=/run/golem-deploy/tls/tls.crt
GOLEM_TLS_KEY_FILE=/run/golem-deploy/tls/tls.key
GOLEM_TLS_PINNED=1                                      # 1 for a self-signed certificate, 0 for an uploaded one
GOLEM_PUBLIC_URL=https://<host>:<port>/wt
GOLEM_WS_FALLBACK_URL=wss://<host>:<port>/api/ws
GOLEM_WT_ALLOWED_ORIGINS=https://<host>:<port>
GOLEM_ADMIN_ADDR=:7778
GOLEM_ADMIN_TOKEN=<random>
```

Golem Deploy does not set a snapshot directory yet, so a deployed server starts with a fresh world after each restart; persistent data volumes and backups are planned.

The browser then loads the page, the realtime config and both transports from one origin, `https://<host>:<port>`: WebTransport over UDP, the page and the WebSocket fallback over TCP. The server reads nothing outside its working directory except the TLS files, and writes only to the snapshot directory.

To make your own game deployable the same way:

1. Build the server with `golem.ServerConfigFromEnv(...)` and run it with the generated `rt.Host(ctx, generated.HostOptions{...})`, seeding the world in `AfterRestore`.
2. Serve the built web client with `HostOptions.AssetsDir` (a path relative to the working directory) and connect from the browser with `fetchRealtimeConfig('/api/realtime-config')` and `connectPlanFromRealtimeConfig` from `golem-engine`.
3. Depend on released packages only (no `replace` directives, no `file:` dependencies) and commit the generated code, so `golem-bake --check` passes on a fresh clone.

## License

Licensed under the [Apache License 2.0](LICENSE).
