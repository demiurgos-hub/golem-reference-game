<script lang="ts">
  import { T } from '@threlte/core';
  import { EntityViews } from 'golem-threlte/threlte';
  import { setContext } from 'svelte';
  import { entityViews, toggleKey } from './views.js';

  let { onToggle }: { onToggle: (slot: number) => void } = $props();
  setContext(toggleKey, (slot: number) => onToggle(slot));
</script>

<T.Color attach="background" args={['#11161c']} />
<T.PerspectiveCamera makeDefault position={[0, 6.5, 7.5]} fov={45} oncreate={(camera) => camera.lookAt(0, 0, 0)} />
<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[3, 8, 4]} intensity={1.6} />
<T.Mesh position={[0, -0.6, 0]}>
  <T.CylinderGeometry args={[4.2, 4.4, 0.3, 64]} />
  <T.MeshStandardMaterial color="#232c35" roughness={0.95} />
</T.Mesh>
<EntityViews registry={entityViews} />
