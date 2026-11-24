import { defineEntityViews } from './generated/threlte/GolemThrelte.js';
import LanternView from './views/LanternView.svelte';

/** Context key for the toggle callback that lantern views call when clicked. */
export const toggleKey = Symbol('toggle-lantern');

export const entityViews = defineEntityViews((views) => ({
  Lantern: views.Lantern.component(LanternView),
  Ring: views.Ring.headless(),
}));
