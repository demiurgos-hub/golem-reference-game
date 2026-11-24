<script lang="ts">
  import { T } from '@threlte/core';
  import { getContext, untrack } from 'svelte';
  import { useEntityTransform } from 'golem-threlte/threlte';
  import type { Group } from 'three';
  import type { LanternViewProps } from '../generated/threlte/GolemThrelte.js';
  import { toggleKey } from '../views.js';

  const { view }: LanternViewProps = $props();
  const binding = untrack(() => view);
  const toggle = getContext<(slot: number) => void>(toggleKey);
  let root: Group | undefined = $state();
  useEntityTransform(binding, {
    target: () => root,
    select: (entity) => ({ position: [entity.posX, entity.posY, entity.posZ] }),
  });
  const lit = $derived($view.entity.lit);
</script>

<T.Group bind:ref={root}>
  <T.Mesh position={[0, -0.25, 0]}>
    <T.CylinderGeometry args={[0.3, 0.38, 0.2, 24]} />
    <T.MeshStandardMaterial color="#3b4652" roughness={0.8} />
  </T.Mesh>
  <T.Mesh position={[0, 0.2, 0]} onclick={() => toggle($view.entity.slot)}>
    <T.SphereGeometry args={[0.35, 24, 16]} />
    <T.MeshStandardMaterial
      color={lit ? '#ffd27a' : '#505a66'}
      emissive={lit ? '#ffb347' : '#000000'}
      emissiveIntensity={lit ? 1.4 : 0}
      roughness={0.4}
    />
  </T.Mesh>
  {#if lit}
    <T.PointLight position={[0, 0.6, 0]} color="#ffbf66" intensity={2.5} distance={3} />
  {/if}
</T.Group>
