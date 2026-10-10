export function normalizeSection(section: string | null, kind?: string): string | null {
  if (section !== "Locations & Maps") return section;
  return kind === "map" ? "Maps" : "Locations";
}
