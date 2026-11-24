import type { EntityUpdate } from "./entities_pb.js";
import { SyncedLantern } from "./LanternSynced.js";
import { SyncedRing } from "./RingSynced.js";
export type SyncedEntity = SyncedLantern | SyncedRing;
/** Manages all synced entities and dispatches incoming EntityUpdate messages. */
export declare class EntityManager {
    private _entities;
    private _lastRevisions;
    /** Compact records that arrived before their entity's spawn, in hold order. */
    private _heldCompact;
    private _heldCount;
    /** Advanced by clear() so a callback that clears stops a replay. */
    private _clearEpoch;
    /** Entities whose evicted records still need a full state of at least `revision`. */
    private _pendingResync;
    private _onResyncNeeded;
    private _onSpawn;
    private _onUpdate;
    private _onRemove;
    private _lanternCtor;
    private _ringCtor;
    get(entityId: number): SyncedEntity | undefined;
    getAll(): ReadonlyMap<number, SyncedEntity>;
    /** Return the Lantern entity with the given id, if present. */
    getLantern(entityId: number): SyncedLantern | undefined;
    /** Return the Ring entity with the given id, if present. */
    getRing(entityId: number): SyncedRing | undefined;
    /** Register a spawn listener. Returns an unsubscribe function. */
    onSpawn(fn: (entity: SyncedEntity) => void): () => void;
    /** Register an update listener. Returns an unsubscribe function. */
    onUpdate(fn: (entity: SyncedEntity) => void): () => void;
    /** Register a removal listener. Returns an unsubscribe function. */
    onRemove(fn: (entityId: number) => void): () => void;
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
    onResyncNeeded(fn: (entityId: number) => void): () => void;
    /**
     * Remove every known entity, fire onRemove for each, and clear revision
     * tracking. Call on disconnect / before reconnect so stale sprites cannot
     * linger when remove frames were lost with the transport.
     */
    clear(): void;
    /**
     * Register a custom subclass for Lantern entity logic.
     * Phaser presentation should use an entity-view registry instead.
     */
    registerLantern(ctor: new (entityId: number) => SyncedLantern): void;
    /**
     * Register a custom subclass for Ring entity logic.
     * Phaser presentation should use an entity-view registry instead.
     */
    registerRing(ctor: new (entityId: number) => SyncedRing): void;
    /**
     * Process a decoded EntityUpdate from the server.
     * Creates, updates, or removes entities and fires the appropriate callback.
     */
    applyUpdate(update: EntityUpdate): void;
    /**
     * Process a compact datagram state record. A record for an entity that is not
     * known yet is held until its full state arrives, because datagrams can
     * overtake the reliable stream that carries the spawn.
     */
    applyCompactUpdate(frame: Uint8Array): void;
    private _removeEntity;
    /**
     * Keep a copy of frame until the entity spawns. At the cap, evict every record
     * of the entity held longest (Map insertion order) and report it for a resync.
     */
    private _holdCompact;
    /**
     * Request a resync again when a full state for an entity with a pending
     * resync is rejected as stale, up to maxResyncRetries times.
     */
    private _staleFullState;
    /** Forget a pending resync once a full state at least as new as the evicted records applied. */
    private _appliedFullState;
    private _dropHeldCompact;
    /**
     * Apply records held for a newly spawned entity; older ones fail the revision
     * check. A callback that calls clear() stops the replay.
     */
    private _replayHeldCompact;
    private _isStale;
    private _applyStateLantern;
    private _applyDeltaLantern;
    private _applyStateRing;
    private _applyDeltaRing;
}
/** Build a ToggleLantern command. */
export declare function buildToggleLanternCommand(slot: number): {
    toggleLantern: {
        slot: number;
    };
};
