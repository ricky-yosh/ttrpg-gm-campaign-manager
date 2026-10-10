import { InventoryView } from "@/components/campaign/inventory-view";
import { NpcPlayerCard } from "@/components/campaign/npc-player-card";
import type { PlayerPresentationContent } from "@/lib/presentation-content";

export function PlayerContentView({ content }: { content: NonNullable<PlayerPresentationContent> }) {
  return content.kind === "inventory" ? <section className="@container mx-auto flex w-full max-w-5xl flex-col gap-6">
    <h1 className="font-serif text-3xl font-semibold">Party Inventory</h1>
    <InventoryView inventory={content.inventory} />
  </section> : <NpcPlayerCard content={content} />;
}
