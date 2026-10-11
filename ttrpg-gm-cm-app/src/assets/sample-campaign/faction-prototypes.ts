import sampleArtwork from "./artwork.json" with { type: "json" };
import type { Faction, Location, Npc } from "@/lib/campaign-data";
import type { FactionAlliance, FactionNode, FactionPrototype } from "@/lib/faction-prototype";

function character(npcs: Npc[], name: string) {
  return npcs.find((npc) => npc.name === name);
}

function location(locations: Location[], name: string) {
  return locations.find((item) => item.name === name);
}

export function sampleFactionPrototype(id: string, factions: Faction[], npcs: Npc[], locations: Location[]): FactionPrototype | null {
  const faction = factions.find((item) => item.id === id);
  if (!faction) return null;

  if (faction.name === "Dockworkers’ Guild") {
    const guildOffice = `sample:${id}:harbor-office`;
    const nodes: FactionNode[] = [
      { id: guildOffice, kind: "group", targetId: "", name: "Harbor office", role: "Local leadership", parentId: "root", relation: "part-of", revealed: true },
      ...(character(npcs, "Niya Jade") ? [{ id: `npc:${character(npcs, "Niya Jade")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Niya Jade")!.id, name: "Niya Jade", role: "Harbormaster", parentId: guildOffice,
        relation: "part-of" as const, revealed: true }] : []),
      ...(character(npcs, "Carlos Tree") ? [{ id: `npc:${character(npcs, "Carlos Tree")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Carlos Tree")!.id, name: "Carlos Tree", role: "Dock watch", parentId: guildOffice,
        relation: "reports-to" as const, revealed: false }] : []),
      ...(character(npcs, "Renot Force") ? [{ id: `npc:${character(npcs, "Renot Force")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Renot Force")!.id, name: "Renot Force", role: "Security contractor", parentId: "root",
        relation: "part-of" as const, revealed: false }] : []),
    ];
    const alliances: FactionAlliance[] = factions.filter((item) => item.name === "The Saltglass Circle").map((item) => ({
      targetId: item.id, label: "Uneasy business partners", revealed: false,
    }));
    return { banner: sampleArtwork.harbor, factionType: "Workers’ guild", headquartersId: location(locations, "The Harbor")?.id ?? "",
      parentFactionId: "", tags: "Trade, Maritime, Greyhaven", known: true, nodes, alliances };
  }

  if (faction.name === "The Saltglass Circle") {
    const archive = `sample:${id}:tide-archive`;
    const nodes: FactionNode[] = [
      { id: archive, kind: "group", targetId: "", name: "Tide archive", role: "Research and records", parentId: "root", relation: "part-of", revealed: false },
      ...(character(npcs, "Renot Force") ? [{ id: `npc:${character(npcs, "Renot Force")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Renot Force")!.id, name: "Renot Force", role: "Keeper of the charts", parentId: archive,
        relation: "part-of" as const, revealed: false }] : []),
      ...(character(npcs, "Niya Jade") ? [{ id: `npc:${character(npcs, "Niya Jade")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Niya Jade")!.id, name: "Niya Jade", role: "Outside contact", parentId: "root",
        relation: "reports-to" as const, revealed: false }] : []),
      ...(character(npcs, "Carlos Tree") ? [{ id: `npc:${character(npcs, "Carlos Tree")!.id}`, kind: "npc" as const,
        targetId: character(npcs, "Carlos Tree")!.id, name: "Carlos Tree", role: "Unwitting guide", parentId: "root",
        relation: "part-of" as const, revealed: false }] : []),
    ];
    const alliances: FactionAlliance[] = factions.filter((item) => item.name === "Dockworkers’ Guild").map((item) => ({
      targetId: item.id, label: "Quietly uses their harbor access", revealed: false,
    }));
    return { banner: sampleArtwork["saltglass-circle"], factionType: "Secret society", headquartersId: location(locations, "Eastern Seawall")?.id ?? "",
      parentFactionId: "", tags: "Mystery, Navigation, Hidden", known: false, nodes, alliances };
  }

  return null;
}
