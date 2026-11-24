<script lang="ts">
  import { GolemProvider } from 'golem-threlte';
  import { createClient } from './generated/client/client.js';
  import { golemAdapter } from './generated/threlte/GolemThrelte.js';
  import { connectionPlan } from './connection.js';
  import Ring from './Ring.svelte';

  const source = {
    kind: 'owned' as const,
    config: {
      createClient,
      connectionOptions: connectionPlan,
      maxReconnectAttempts: 0,
      reconnectBaseDelay: 1000,
    },
  };
</script>

<GolemProvider adapter={golemAdapter} {source}>
  <Ring />
</GolemProvider>
