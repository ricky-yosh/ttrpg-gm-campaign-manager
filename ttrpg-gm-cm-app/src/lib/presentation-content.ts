import type { Campaign } from "./campaign-data.ts";
import { emptyInventory, type PartyInventory } from "./inventory-data.ts";

export type PresenterSection = "map" | "npcs" | "inventory";
export type PlayerPresentationContent =
  | { kind: "npc"; name: string; description: string; portraitUrl: string | null }
  | { kind: "inventory"; inventory: PartyInventory }
  | null;

export function buildPlayerContent(campaign: Campaign, section: PresenterSection, npcId: string | null): PlayerPresentationContent {
  if (section === "inventory") {
    const inventory = campaign.inventory ?? emptyInventory();
    return { kind: "inventory", inventory: { gold: inventory.gold, entries: inventory.entries.map(({ id, name, kind, quantity, note }) => ({ id, name, kind, quantity, note })) } };
  }
  if (section !== "npcs" || !npcId) return null;
  const npc = campaign.npcs.find((item) => item.id === npcId);
  return npc ? { kind: "npc", name: npc.name, description: npc.presentation.playerDescription, portraitUrl: npc.presentation.portrait?.url ?? null } : null;
}

export function resolvePresentationContent(status: "stopped" | "live" | "paused", next: PlayerPresentationContent, previous: PlayerPresentationContent) {
  if (status === "stopped") return null;
  return status === "paused" ? previous : next;
}
