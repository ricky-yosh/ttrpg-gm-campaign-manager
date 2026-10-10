export type LocationImage = { type: "img"; url: string };
export type LocationReference = {
  atmosphere: string;
  background: string;
  currentSituation: string;
  secrets: string;
};
export type Location = {
  id: string;
  name: string;
  image: LocationImage | null;
  publicDescription: string;
  gmNotes: string;
  parentId?: string | null;
  locationType?: string;
  tags?: string[];
  partyKnowledge?: "unknown" | "known" | "visited";
  banner?: LocationImage | null;
  gmReference?: LocationReference;
};

export function withLocationDefaults(location: Location) {
  return {
    ...location,
    parentId: location.parentId ?? null,
    locationType: location.locationType ?? "",
    tags: location.tags ?? [],
    partyKnowledge: location.partyKnowledge ?? "unknown",
    banner: location.banner ?? null,
    gmReference: { atmosphere: "", background: "", currentSituation: "", secrets: "", ...location.gmReference },
  };
}

export function locationAncestors(locations: Location[], id: string): Location[] {
  const records = new Map(locations.map((location) => [location.id, location]));
  const ancestors: Location[] = [];
  const seen = new Set([id]);
  let parentId = records.get(id)?.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = records.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return ancestors;
}

export function canParentLocation(locations: Location[], id: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  return parentId !== id && locations.some((location) => location.id === parentId)
    && !locationAncestors(locations, parentId).some((location) => location.id === id);
}

export function locationSearchResults(locations: Location[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  return locations.filter((location) => location.name.toLocaleLowerCase().includes(search))
    .map((location) => ({ location, path: locationAncestors(locations, location.id).map((parent) => parent.name).join(" / ") }));
}
