export type ItemFieldKind = "text" | "number" | "checkbox" | "choice";
export type ItemFieldDefinition = {
  id: string;
  label: string;
  kind: ItemFieldKind;
  options: { id: string; label: string }[];
};
export type ItemValue = string | number | boolean | null;
export type CampaignItem = {
  id: string;
  name: string;
  image: { type: "img"; url: string } | null;
  description: string;
  gmNotes: string;
  values: Record<string, ItemValue>;
};
export type ItemDraft = { item: CampaignItem; fields: ItemFieldDefinition[] };

export function newItem(name: string): CampaignItem {
  return { id: crypto.randomUUID(), name: name.trim(), image: null, description: "", gmNotes: "", values: {} };
}

export function itemFieldsError(fields: ItemFieldDefinition[]): string | null {
  const ids = new Set<string>();
  for (const field of fields) {
    if (!field.id.trim() || ids.has(field.id) || !field.label.trim()) return "Fields need unique IDs and a label.";
    ids.add(field.id);
    if (!["text", "number", "checkbox", "choice"].includes(field.kind)) return "Choose a supported field type.";
    if (field.kind !== "choice" && field.options.length) return "Only choice fields can have options.";
    if (field.kind === "choice") {
      const optionIds = new Set<string>();
      const labels = new Set<string>();
      if (!field.options.length) return "Add at least one choice.";
      for (const option of field.options) {
        const label = option.label.trim().toLocaleLowerCase();
        if (!option.id.trim() || !label || optionIds.has(option.id) || labels.has(label)) return "Choices need unique IDs and distinct labels.";
        optionIds.add(option.id);
        labels.add(label);
      }
    }
  }
  return null;
}

export function itemError(item: CampaignItem, fields: ItemFieldDefinition[]): string | null {
  if (!item.id.trim() || !item.name.trim()) return "Give this item a name.";
  if (item.image && (item.image.type !== "img" || !item.image.url)) return "Choose a valid item image.";
  const definitions = new Map(fields.map((field) => [field.id, field]));
  for (const [id, value] of Object.entries(item.values)) {
    const field = definitions.get(id);
    if (!field) return "An item property refers to an unavailable field.";
    if (value === null) continue;
    const valid = field.kind === "text" ? typeof value === "string"
      : field.kind === "number" ? typeof value === "number" && Number.isFinite(value)
      : field.kind === "checkbox" ? typeof value === "boolean"
      : typeof value === "string" && field.options.some((option) => option.id === value);
    if (!valid) return `Enter a valid value for ${field.label}.`;
  }
  return null;
}

export function formatItemValue(field: ItemFieldDefinition, value: ItemValue | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.kind === "choice") return field.options.find((option) => option.id === value)?.label ?? "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function matchingItems(items: CampaignItem[], query: string): CampaignItem[] {
  const search = query.trim().toLocaleLowerCase();
  return items.filter((item) => item.name.toLocaleLowerCase().includes(search));
}

export function compareItems(a: CampaignItem, b: CampaignItem, field: ItemFieldDefinition | undefined, descending: boolean): number {
  if (!field) return (descending ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true });
  const left = a.values[field.id];
  const right = b.values[field.id];
  const missing = (value: ItemValue | undefined) => value === undefined || value === null || value === "";
  if (missing(left) || missing(right)) return Number(missing(left)) - Number(missing(right)) || a.name.localeCompare(b.name);
  const compare = field.kind === "number" ? Number(left) - Number(right)
    : field.kind === "checkbox" ? Number(left) - Number(right)
    : field.kind === "choice" ? field.options.findIndex((option) => option.id === left) - field.options.findIndex((option) => option.id === right)
    : String(left).localeCompare(String(right), undefined, { numeric: true });
  return (descending ? -1 : 1) * compare || a.name.localeCompare(b.name);
}
