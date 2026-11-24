import { GameClient } from "golem-engine";
export type { EntityLifecycle } from "golem-engine";
import { EntityManager } from "./EntityManager.js";
export { buildToggleLanternCommand } from "./EntityManager.js";
/** GameClient with the generated managers exposed as concrete types. */
export type Client = GameClient & {
    readonly entities: EntityManager;
};
/** Build and send a ToggleLantern command using the default reliable delivery mode. */
export declare function sendToggleLantern(client: GameClient, slot: number): void;
/** Build and send a ToggleLantern command using reliable ordered delivery. */
export declare function sendToggleLanternOrdered(client: GameClient, slot: number): void;
/** Create a Client wired to the generated EntityManager and protobuf codec. */
export declare function createClient(): Client;
