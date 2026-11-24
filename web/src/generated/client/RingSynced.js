/** Client-side synced state for a Ring entity. */
export class SyncedRing {
    constructor(entityId) {
        this._posX = 0;
        this._posY = 0;
        this._posZ = 0;
        this._revision = 0;
        this._switches = 0;
        this._visitors = 0;
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
    get switches() {
        return this._switches;
    }
    get visitors() {
        return this._visitors;
    }
    /** Applies a full state snapshot (used on join / world state). */
    applyState(s) {
        this._posX = s.posX;
        this._posY = s.posY;
        this._posZ = s.posZ;
        this._revision = Number(s.revision);
        this._switches = s.switches;
        this._visitors = s.visitors;
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
        if (d.switches !== undefined)
            this._switches = d.switches;
        if (d.visitors !== undefined)
            this._visitors = d.visitors;
    }
}
