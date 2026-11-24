import { connectPlanFromRealtimeConfig, fetchRealtimeConfig, type ConnectPlan } from 'golem-engine';
import { writable } from 'svelte/store';

/** The transport of the most recent dial: WebTransport first, then the WebSocket fallback. */
export const dialledTransport = writable<'webtransport' | 'websocket' | undefined>(undefined);

/**
 * Builds the connection plan from the server's realtime config, served by the
 * same origin as this page. The server decides the URLs (and, for pinned
 * certificates, the hashes); the client only follows them. It runs again on
 * every reconnect, so a restarted server's new certificate is picked up.
 */
export async function connectionPlan(): Promise<ConnectPlan> {
  const config = await fetchRealtimeConfig('/api/realtime-config');
  return connectPlanFromRealtimeConfig(config, (endpoint) => {
    dialledTransport.set(endpoint.transport);
    return endpoint;
  });
}
