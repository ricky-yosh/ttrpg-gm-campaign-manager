export type InventoryEntry = { id: string; name: string; kind: "item" | "material"; quantity: number; note: string };
export type PartyInventory = { gold: number; entries: InventoryEntry[] };
export const emptyInventory = (): PartyInventory => ({ gold: 0, entries: [] });

export function inventoryError(inventory: PartyInventory): string | null {
  if (!Number.isSafeInteger(inventory.gold) || inventory.gold < 0) return "Gold must be a nonnegative whole number.";
  const ids = new Set<string>();
  for (const entry of inventory.entries) {
    if (!entry.id.trim() || ids.has(entry.id)) return "Inventory entries need unique IDs.";
    ids.add(entry.id);
    if (!entry.name.trim()) return "Every entry needs a name.";
    if (entry.kind !== "item" && entry.kind !== "material") return "Choose Item or Material for each entry.";
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return "Quantities must be positive whole numbers. Remove an entry when none remain.";
  }
  return null;
}
