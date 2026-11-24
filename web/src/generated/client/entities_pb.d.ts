export declare class LanternState {
    entityId: number;
    posX: number;
    posY: number;
    posZ: number;
    revision: number;
    slot: number;
    lit: boolean;
    static encode(m: LanternState): Uint8Array;
    static decode(b: Uint8Array): LanternState;
}
export declare class LanternDelta {
    entityId: number;
    posX?: number;
    posY?: number;
    posZ?: number;
    revision: number;
    slot?: number;
    lit?: boolean;
    static encode(m: LanternDelta): Uint8Array;
    static decode(b: Uint8Array): LanternDelta;
}
export declare class RingState {
    entityId: number;
    posX: number;
    posY: number;
    posZ: number;
    revision: number;
    switches: number;
    visitors: number;
    static encode(m: RingState): Uint8Array;
    static decode(b: Uint8Array): RingState;
}
export declare class RingDelta {
    entityId: number;
    posX?: number;
    posY?: number;
    posZ?: number;
    revision: number;
    switches?: number;
    visitors?: number;
    static encode(m: RingDelta): Uint8Array;
    static decode(b: Uint8Array): RingDelta;
}
export declare class EntityRemoved {
    entityId: number;
    revision: number;
    static encode(m: EntityRemoved): Uint8Array;
    static decode(b: Uint8Array): EntityRemoved;
}
export declare class EntityUpdate {
    lanternState?: LanternState;
    lanternDelta?: LanternDelta;
    ringState?: RingState;
    ringDelta?: RingDelta;
    entityRemoved?: EntityRemoved;
    static decode(b: Uint8Array): EntityUpdate;
}
export declare class ToggleLanternCommand {
    slot: number;
    static encode(m: ToggleLanternCommand): Uint8Array;
}
export declare class ClientMessage {
    toggleLantern?: ToggleLanternCommand;
    static encode(m: ClientMessage): Uint8Array;
}
export declare class ClientPacket {
    static encode(frames: Uint8Array[]): Uint8Array;
}
