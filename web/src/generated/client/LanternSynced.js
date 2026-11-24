/** Client-side synced state for a Lantern entity. */
export class SyncedLantern {
    constructor(entityId) {
        this._posX = 0;
        this._posY = 0;
        this._posZ = 0;
        this._revision = 0;
        this._slot = 0;
        this._lit = false;
        this.entityId = entityId;
    }
    get posX() {
        return this._posX;
    }
    get posY() {
        return this._posY;
    }
    get posZ() {
        return this._posZ;
    }
    get revision() {
        return this._revision;
    }
    get slot() {
        return this._slot;
    }
    get lit() {
        return this._lit;
    }
    /** Applies a full state snapshot (used on join / world state). */
    applyState(s) {
        this._posX = s.posX;
        this._posY = s.posY;
        this._posZ = s.posZ;
        this._revision = Number(s.revision);
        this._slot = s.slot;
        this._lit = s.lit;
    }
    /** Applies a delta update (only present fields are overwritten). */
    applyDelta(d) {
        this._revision = Number(d.revision);
        if (d.posX !== undefined)
            this._posX = d.posX;
        if (d.posY !== undefined)
            this._posY = d.posY;
        if (d.posZ !== undefined)
            this._posZ = d.posZ;
        if (d.slot !== undefined)
            this._slot = d.slot;
        if (d.lit !== undefined)
            this._lit = d.lit;
    }
}
