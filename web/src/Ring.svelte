<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { useGolem } from './generated/threlte/GolemThrelte.js';
  import { sendToggleLantern } from './generated/client/client.js';
  import { dialledTransport } from './connection.js';
  import Scene from './Scene.svelte';

  const golem = useGolem();
  const { status } = golem;
  const lanterns = golem.entityTypes.Lantern.all;
  const rings = golem.entityTypes.Ring.all;
  const connected = $derived($status.type === 'connected');
  // The stores emit a new list on every change, but each item's entity is the
  // client's one live model, mutated in place. Copy the fields the page shows
  // so Svelte sees new values rather than the same object reference.
  const sorted = $derived(
    $lanterns
      .map(({ entity }) => ({ id: entity.entityId, slot: entity.slot, lit: entity.lit }))
      .sort((a, b) => a.slot - b.slot),
  );
  const switches = $derived($rings[0]?.entity.switches ?? 0);
  const visitors = $derived($rings[0]?.entity.visitors ?? 0);
  const litCount = $derived(sorted.filter((lantern) => lantern.lit).length);

  function toggle(slot: number) {
    if (connected) sendToggleLantern(golem.client, slot);
  }
</script>

<main>
  <header>
    <h1>Lantern Ring</h1>
    <p class="status" class:online={connected}>
      <span data-testid="connection-status">{$status.type}</span>
      {#if connected && $dialledTransport}<span data-testid="transport">{$dialledTransport}</span>{/if}
    </p>
  </header>

  <section class="stage" aria-label="Lantern ring">
    <Canvas dpr={[1, 1.5]}><Scene onToggle={toggle} /></Canvas>
  </section>

  <section class="panel">
    <p>Light or snuff a lantern. Everyone connected sees it, and the ring remembers it across server restarts.</p>
    <div class="lanterns">
      {#each sorted as lantern (lantern.id)}
        <button
          class:lit={lantern.lit}
          disabled={!connected}
          aria-pressed={lantern.lit}
          data-testid={`lantern-${lantern.slot}`}
          onclick={() => toggle(lantern.slot)}
        >Lantern {lantern.slot + 1}</button>
      {/each}
    </div>
    <dl>
      <div><dt>Lit</dt><dd data-testid="lit-count">{litCount}</dd></div>
      <div><dt>Switches</dt><dd data-testid="switches">{switches}</dd></div>
      <div><dt>Visitors</dt><dd data-testid="visitors">{visitors}</dd></div>
    </dl>
  </section>
</main>
