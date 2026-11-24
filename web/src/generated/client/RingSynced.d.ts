import type { RingState, RingDelta } from "./entities_pb.js";
/** Client-side synced state for a Ring entity. */
export declare class SyncedRing {
    readonly entityId: number;
    private _posX;
    private _posY;
    private _posZ;
    private _revision;
    private _switches;
    private _visitors;
    constructor(entityId: number);
    get posX(): number;
    get posY(): number;
    get posZ(): number;
    get revision(): number;
    get switches(): number;
    get visitors(): number;
    /** Applies a full state snapshot (used on join / world state). */
    applyState(s: RingState): void;
    /** Applies a delta update (only present fields are overwritten). */
    applyDelta(d: RingDelta): void;
}
