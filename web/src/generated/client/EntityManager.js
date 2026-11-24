import { PbReader } from "golem-engine";
import { LanternDelta, RingDelta } from "./entities_pb.js";
import { SyncedLantern } from "./LanternSynced.js";
import { SyncedRing } from "./RingSynced.js";
/**
 * Bounds compact records held for entities whose spawn has not arrived yet. When
 * it is reached, all records of the entity held longest are evicted and the
 * resync listeners are told about that entity.
 */
const maxHeldCompactUpdates = 256;
/** Bounds how often one pending resync is requested again after its recovery full state was rejected as stale. */
const maxResyncRetries = 3;
/** Manages all synced entities and dispatches incoming EntityUpdate messages. */
export class EntityManager {
    constructor() {
        this._entities = new Map();
        this._lastRevisions = new Map();
        /** Compact records that arrived before their entity's spawn, in hold order. */
        this._heldCompact = new Map();
        this._heldCount = 0;
        /** Advanced by clear() so a callback that clears stops a replay. */
        this._clearEpoch = 0;
        /** Entities whose evicted records still need a full state of at least `revision`. */
        this._pendingResync = new Map();
        this._onResyncNeeded = new Set();
        this._onSpawn = new Set();
        this._onUpdate = new Set();
        this._onRemove = new Set();
        this._lanternCtor = SyncedLantern;
        this._ringCtor = SyncedRing;
    }
    get(entityId) {
        return this._entities.get(entityId);
    }
    getAll() {
        return this._entities;
    }
    /** Return the Lantern entity with the given id, if present. */
    getLantern(entityId) {
        const entity = this._entities.get(entityId);
        return entity instanceof SyncedLantern ? entity : undefined;
    }
    /** Return the Ring entity with the given id, if present. */
    getRing(entityId) {
        const entity = this._entities.get(entityId);
        return entity instanceof SyncedRing ? entity : undefined;
    }
    /** Register a spawn listener. Returns an unsubscribe function. */
    onSpawn(fn) {
        this._onSpawn.add(fn);
        return () => { this._onSpawn.delete(fn); };
    }
    /** Register an update listener. Returns an unsubscribe function. */
    onUpdate(fn) {
        this._onUpdate.add(fn);
        return () => { this._onUpdate.delete(fn); };
    }
    /** Register a removal listener. Returns an unsubscribe function. */
    onRemove(fn) {
        this._onRemove.add(fn);
        return () => { this._onRemove.delete(fn); };
    }
    /**
     * Register a listener fired with an entity id when the compact records held
     * for that entity are evicted before its spawn arrived. Those datagrams were
     * already acknowledged, so the server will not resend them; GameClient
     * registers a listener that requests a full state of the entity. The manager
     * remembers the request until a full state at least as new as the evicted
     * records applies, or the entity is removed or cleared; when a full state for
     * it is rejected as stale (a newer datagram overtook it), the listeners fire
     * again, at most three times. Returns an unsubscribe function.
     */
    onResyncNeeded(fn) {
        this._onResyncNeeded.add(fn);
        return () => { this._onResyncNeeded.delete(fn); };
    }
    /**
     * Remove every known entity, fire onRemove for each, and clear revision
     * tracking. Call on disconnect / before reconnect so stale sprites cannot
     * linger when remove frames were lost with the transport.
     */
    clear() {
        this._clearEpoch++;
        const ids = [...this._entities.keys()];
        for (const id of ids) {
            this._removeEntity(id);
        }
        this._lastRevisions.clear();
        this._heldCompact.clear();
        this._heldCount = 0;
        this._pendingResync.clear();
    }
    /**
     * Register a custom subclass for Lantern entity logic.
     * Phaser presentation should use an entity-view registry instead.
     */
    registerLantern(ctor) { this._lanternCtor = ctor; }
    /**
     * Register a custom subclass for Ring entity logic.
     * Phaser presentation should use an entity-view registry instead.
     */
    registerRing(ctor) { this._ringCtor = ctor; }
    /**
     * Process a decoded EntityUpdate from the server.
     * Creates, updates, or removes entities and fires the appropriate callback.
     */
    applyUpdate(update) {
        if (update.lanternState) {
            this._applyStateLantern(update.lanternState);
            return;
        }
        if (update.lanternDelta) {
            this._applyDeltaLantern(update.lanternDelta);
            return;
        }
        if (update.ringState) {
            this._applyStateRing(update.ringState);
            return;
        }
        if (update.ringDelta) {
            this._applyDeltaRing(update.ringDelta);
            return;
        }
        if (update.entityRemoved) {
            const id = Number(update.entityRemoved.entityId);
            const revision = Number(update.entityRemoved.revision);
            if (this._isStale(id, revision))
                return;
            this._lastRevisions.set(id, revision);
            this._pendingResync.delete(id);
            this._removeEntity(id);
            this._dropHeldCompact(id);
        }
    }
    /**
     * Process a compact datagram state record. A record for an entity that is not
     * known yet is held until its full state arrives, because datagrams can
     * overtake the reliable stream that carries the spawn.
     */
    applyCompactUpdate(frame) {
        const r = new PbReader(frame);
        const id = Number(r.int64());
        const revision = Number(r.uint64());
        const mask = Number(r.uint64());
        if (mask === 0 || this._isStale(id, revision))
            return;
        const entity = this._entities.get(id);
        if (!entity) {
            this._holdCompact(id, frame);
            return;
        }
        const body = r.remaining();
        if (entity instanceof SyncedLantern) {
            const d = LanternDelta.decode(body);
            d.entityId = id;
            d.revision = revision;
            this._applyDeltaLantern(d);
            return;
        }
        if (entity instanceof SyncedRing) {
            const d = RingDelta.decode(body);
            d.entityId = id;
            d.revision = revision;
            this._applyDeltaRing(d);
            return;
        }
    }
    _removeEntity(id) {
        const removed = this._entities.get(id);
        if (!removed || !this._entities.delete(id))
            return;
        removed.onRemove?.();
        for (const fn of this._onRemove)
            fn(id);
    }
    /**
     * Keep a copy of frame until the entity spawns. At the cap, evict every record
     * of the entity held longest (Map insertion order) and report it for a resync.
     */
    _holdCompact(id, frame) {
        const epoch = this._clearEpoch;
        while (this._heldCount >= maxHeldCompactUpdates) {
            const oldest = this._heldCompact.keys().next();
            if (oldest.done)
                break;
            const revision = heldRevision(this._heldCompact.get(oldest.value));
            this._dropHeldCompact(oldest.value);
            const listeners = [...this._onResyncNeeded];
            if (listeners.length > 0) {
                const pending = this._pendingResync.get(oldest.value);
                this._pendingResync.set(oldest.value, { revision: Math.max(pending?.revision ?? 0, revision), retries: pending?.retries ?? 0 });
            }
            for (const fn of listeners) {
                fn(oldest.value);
                if (this._clearEpoch !== epoch)
                    return;
            }
        }
        let held = this._heldCompact.get(id);
        if (!held) {
            held = [];
            this._heldCompact.set(id, held);
        }
        held.push(frame.slice());
        this._heldCount++;
    }
    /**
     * Request a resync again when a full state for an entity with a pending
     * resync is rejected as stale, up to maxResyncRetries times.
     */
    _staleFullState(id) {
        const pending = this._pendingResync.get(id);
        if (!pending)
            return;
        if (pending.retries >= maxResyncRetries || this._onResyncNeeded.size === 0) {
            this._pendingResync.delete(id);
            return;
        }
        pending.retries++;
        const epoch = this._clearEpoch;
        for (const fn of [...this._onResyncNeeded]) {
            fn(id);
            if (this._clearEpoch !== epoch)
                return;
        }
    }
    /** Forget a pending resync once a full state at least as new as the evicted records applied. */
    _appliedFullState(id, revision) {
        const pending = this._pendingResync.get(id);
        if (pending && revision >= pending.revision)
            this._pendingResync.delete(id);
    }
    _dropHeldCompact(id) {
        const held = this._heldCompact.get(id);
        if (!held)
            return;
        this._heldCount -= held.length;
        this._heldCompact.delete(id);
    }
    /**
     * Apply records held for a newly spawned entity; older ones fail the revision
     * check. A callback that calls clear() stops the replay.
     */
    _replayHeldCompact(id) {
        const held = this._heldCompact.get(id);
        if (!held)
            return;
        this._dropHeldCompact(id);
        const epoch = this._clearEpoch;
        for (const frame of held) {
            if (this._clearEpoch !== epoch)
                return;
            this.applyCompactUpdate(frame);
        }
    }
    _isStale(entityId, revision) {
        const last = this._lastRevisions.get(entityId);
        return last !== undefined && revision < last;
    }
    _applyStateLantern(s) {
        const id = Number(s.entityId);
        const revision = Number(s.revision);
        if (this._isStale(id, revision)) {
            this._staleFullState(id);
            return;
        }
        let e = this._entities.get(id);
        const isNew = !e;
        if (isNew) {
            e = new this._lanternCtor(id);
            this._entities.set(id, e);
        }
        e.applyState(s);
        this._lastRevisions.set(id, revision);
        this._appliedFullState(id, revision);
        if (isNew) {
            const epoch = this._clearEpoch;
            e.onSpawn?.();
            for (const fn of this._onSpawn)
                fn(e);
            if (this._clearEpoch === epoch)
                this._replayHeldCompact(id);
        }
        else {
            for (const fn of this._onUpdate)
                fn(e);
        }
    }
    _applyDeltaLantern(d) {
        const id = Number(d.entityId);
        const revision = Number(d.revision);
        if (this._isStale(id, revision))
            return;
        const e = this._entities.get(id);
        if (e) {
            e.applyDelta(d);
            this._lastRevisions.set(id, revision);
            for (const fn of this._onUpdate)
                fn(e);
        }
    }
    _applyStateRing(s) {
        const id = Number(s.entityId);
        const revision = Number(s.revision);
        if (this._isStale(id, revision)) {
            this._staleFullState(id);
            return;
        }
        let e = this._entities.get(id);
        const isNew = !e;
        if (isNew) {
            e = new this._ringCtor(id);
            this._entities.set(id, e);
        }
        e.applyState(s);
        this._lastRevisions.set(id, revision);
        this._appliedFullState(id, revision);
        if (isNew) {
            const epoch = this._clearEpoch;
            e.onSpawn?.();
            for (const fn of this._onSpawn)
                fn(e);
            if (this._clearEpoch === epoch)
                this._replayHeldCompact(id);
        }
        else {
            for (const fn of this._onUpdate)
                fn(e);
        }
    }
    _applyDeltaRing(d) {
        const id = Number(d.entityId);
        const revision = Number(d.revision);
        if (this._isStale(id, revision))
            return;
        const e = this._entities.get(id);
        if (e) {
            e.applyDelta(d);
            this._lastRevisions.set(id, revision);
            for (const fn of this._onUpdate)
                fn(e);
        }
    }
}
/** Return the newest revision among held compact records. */
function heldRevision(held) {
    let newest = 0;
    for (const frame of held) {
        const r = new PbReader(frame);
        r.int64();
        newest = Math.max(newest, Number(r.uint64()));
    }
    return newest;
}
// --- Command builders ---
// Each function returns a plain object matching the ClientMessage shape.
// Send with client.send(buildMoveCommand(...)) or client.sendOrdered(buildMoveCommand(...)).
/** Build a ToggleLantern command. */
export function buildToggleLanternCommand(slot) {
    return { toggleLantern: { slot } };
}
