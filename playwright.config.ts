import { defineConfig } from '@playwright/test';

// Without PLAYWRIGHT_BASE_URL the test starts the local development server
// (npm run server: WebTransport with the engine's development certificate plus
// the WebSocket fallback on 127.0.0.1:8080). Point PLAYWRIGHT_BASE_URL at a
// running or deployed game to test that instead. PLAYWRIGHT_CHANNEL=chrome
// uses the installed Chrome instead of a downloaded browser.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    // A deployed game may serve a self-signed certificate; WebTransport then
    // pins it through the hashes in the realtime config.
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webtransport', metadata: { transport: 'webtransport' } },
    { name: 'websocket-fallback', metadata: { transport: 'websocket' } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run server',
    url: `${baseURL}/api/realtime-config`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
