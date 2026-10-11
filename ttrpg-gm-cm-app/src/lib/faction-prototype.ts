import type { Npc } from "./campaign-data";

export type FactionNode = {
  id: string;
  kind: "npc" | "faction" | "group";
  targetId: string;
  name: string;
  role: string;
  parentId: string;
  relation: "part-of" | "reports-to";
  revealed: boolean;
};
export type FactionAlliance = { targetId: string; label: string; revealed: boolean };
export type FactionPrototype = {
  banner: string | null;
  factionType: string;
  headquartersId: string;
  parentFactionId: string;
  tags: string;
  known: boolean;
  nodes: FactionNode[];
  alliances: FactionAlliance[];
};

export function initialFactionPrototype(factionId: string, npcs: Npc[]): FactionPrototype {
  return {
    banner: null, factionType: "", headquartersId: "", parentFactionId: "", tags: "", known: false,
    alliances: [],
    nodes: npcs.flatMap((npc) => {
      const affiliation = npc.presentation.factions.find((link) => link.targetId === factionId);
      return affiliation ? [{ id: `npc:${npc.id}`, kind: "npc" as const, targetId: npc.id, name: npc.name,
        role: affiliation.label || "Member", parentId: "root", relation: "part-of" as const, revealed: false }] : [];
    }),
  };
}

export function canParentNode(nodes: FactionNode[], nodeId: string, parentId: string): boolean {
  const visited = new Set([nodeId]);
  let current = parentId;
  while (current !== "root") {
    if (visited.has(current)) return false;
    visited.add(current);
    const parent = nodes.find((node) => node.id === current);
    if (!parent) return false;
    current = parent.parentId;
  }
  return true;
}

export function removeFactionNode(nodes: FactionNode[], nodeId: string): FactionNode[] {
  const parentId = nodes.find((node) => node.id === nodeId)?.parentId ?? "root";
  return nodes.filter((node) => node.id !== nodeId).map((node) => node.parentId === nodeId
    ? { ...node, parentId, relation: "part-of" } : node);
}

export function publicFactionNodes(nodes: FactionNode[]): FactionNode[] {
  const visible = nodes.filter((node) => node.revealed);
  const ids = new Set(visible.map((node) => node.id));
  return visible.map((node) => ids.has(node.parentId) || node.parentId === "root" ? node
    : { ...node, parentId: "root", relation: "part-of" });
}
