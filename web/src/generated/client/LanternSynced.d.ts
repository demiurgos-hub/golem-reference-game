import type { LanternState, LanternDelta } from "./entities_pb.js";
/** Client-side synced state for a Lantern entity. */
export declare class SyncedLantern {
    readonly entityId: number;
    private _posX;
    private _posY;
    private _posZ;
    private _revision;
    private _slot;
    private _lit;
    constructor(entityId: number);
    get posX(): number;
    get posY(): number;
    get posZ(): number;
    get revision(): number;
    get slot(): number;
    get lit(): boolean;
    /** Applies a full state snapshot (used on join / world state). */
    applyState(s: LanternState): void;
    /** Applies a delta update (only present fields are overwritten). */
    applyDelta(d: LanternDelta): void;
}
