import { expect, test, type Page } from '@playwright/test';

type Transport = 'webtransport' | 'websocket';

// Each project runs the same check over one transport. The fallback project
// hides the WebTransport API, as an older browser would, so the client skips
// the primary endpoint and uses the advertised WebSocket fallback.
async function open(page: Page, transport: Transport, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  if (transport === 'websocket') {
    await page.addInitScript(() => { Reflect.deleteProperty(globalThis, 'WebTransport'); });
  }
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('connected');
  await expect(page.getByTestId('transport')).toHaveText(transport);
  await expect(page.getByRole('button', { name: /^Lantern \d$/ })).toHaveCount(8);
}

test('a player lights a lantern and every player sees it', async ({ browser }, testInfo) => {
  const transport = testInfo.project.metadata.transport as Transport;
  const errors: string[] = [];
  const sockets: string[] = [];
  const first = await browser.newPage();
  const second = await browser.newPage();
  first.on('websocket', (socket) => sockets.push(socket.url()));
  second.on('websocket', (socket) => sockets.push(socket.url()));
  await open(first, transport, errors);
  await open(second, transport, errors);

  const lantern = (page: Page) => page.getByTestId('lantern-2');
  const wasLit = (await lantern(first).getAttribute('aria-pressed')) === 'true';
  const switches = Number(await first.getByTestId('switches').innerText());
  await expect(first.getByTestId('visitors')).not.toHaveText('0');

  await lantern(first).click();

  const nowLit = String(!wasLit);
  await expect(lantern(first)).toHaveAttribute('aria-pressed', nowLit);
  await expect(lantern(second)).toHaveAttribute('aria-pressed', nowLit);
  await expect(second.getByTestId('switches')).toHaveText(String(switches + 1));

  // Toggle back from the other page so repeated runs leave the ring as found.
  await lantern(second).click();
  await expect(lantern(first)).toHaveAttribute('aria-pressed', String(wasLit));
  await expect(first.getByTestId('switches')).toHaveText(String(switches + 2));

  if (transport === 'webtransport') expect(sockets).toEqual([]);
  else expect(sockets.length).toBe(2);
  expect(errors).toEqual([]);
});
