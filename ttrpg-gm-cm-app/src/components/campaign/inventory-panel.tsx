import { useEffect, useId, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { InventoryView } from "@/components/campaign/inventory-view";
import { emptyInventory, type PartyInventory } from "@/lib/inventory-data";
import { saveInventory, useCampaign } from "@/lib/campaign-data";

const toDraft = (inventory: PartyInventory) => ({ gold: String(inventory.gold), entries: inventory.entries.map((entry) => ({ ...entry, quantity: String(entry.quantity) })) });

export function InventoryPanel({ params, api }: IDockviewPanelProps) {
  const fieldId = useId();
  const saved = useCampaign((state) => state.campaign.inventory);
  const inventory = saved ?? emptyInventory();
  const [draft, setDraft] = useState(() => toDraft(inventory));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => { setDraft(toDraft(saved ?? emptyInventory())); setEditing(false); setError(""); }, [saved]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScroll.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(inventory));
  const save = () => {
    const result = saveInventory({ gold: draft.gold.trim() ? Number(draft.gold) : NaN, entries: draft.entries.map((entry) => ({ ...entry, quantity: entry.quantity.trim() ? Number(entry.quantity) : NaN })) });
    if (result) { setError(result); return; }
    setEditing(false);
    setError("");
  };
  return <article ref={scrollRef} className="@container h-full overflow-auto p-6 sm:p-8" onScroll={(event) => {
    api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
    window.dispatchEvent(new Event("campaign-workspace-change"));
  }}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-serif text-3xl font-semibold">Party Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Shared gold, carried items, and materials. All recorded details are player-facing.</p></div>
      <div className="flex flex-wrap items-center gap-2">{editing ? <>
        {changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button variant="outline" onClick={() => { setDraft(toDraft(inventory)); setEditing(false); setError(""); }}>Cancel</Button>
        <Button disabled={!changed} onClick={save}>Save changes</Button>
      </> : <Button variant="outline" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" />Edit</Button>}</div>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {editing ? <div className="flex flex-col gap-5">
      <Card><CardHeader><CardTitle variant="dossier">Party gold</CardTitle></CardHeader><CardContent><FieldGroup><Field>
        <FieldLabel htmlFor={`${fieldId}-gold`}>Gold</FieldLabel><Input id={`${fieldId}-gold`} type="number" min="0" step="1" value={draft.gold} onChange={(event) => setDraft({ ...draft, gold: event.currentTarget.value })} />
      </Field></FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle variant="dossier">Items and materials</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
        {draft.entries.map((entry, index) => {
          const update = (change: Partial<typeof entry>) => setDraft({ ...draft, entries: draft.entries.map((item) => item.id === entry.id ? { ...item, ...change } : item) });
          return <section key={entry.id} aria-label={`Inventory entry ${index + 1}`} className="rounded-lg border p-4"><FieldGroup>
            <Field><FieldLabel htmlFor={`${fieldId}-${entry.id}-name`}>Name</FieldLabel><Input id={`${fieldId}-${entry.id}-name`} value={entry.name} onChange={(event) => update({ name: event.currentTarget.value })} /></Field>
            <div className="grid grid-cols-1 gap-4 @min-[500px]:grid-cols-2">
              <Field><FieldLabel htmlFor={`${fieldId}-${entry.id}-kind`}>Category</FieldLabel><NativeSelect className="w-full" id={`${fieldId}-${entry.id}-kind`} value={entry.kind} onChange={(event) => update({ kind: event.currentTarget.value === "material" ? "material" : "item" })}><NativeSelectOption value="item">Item</NativeSelectOption><NativeSelectOption value="material">Material</NativeSelectOption></NativeSelect></Field>
              <Field><FieldLabel htmlFor={`${fieldId}-${entry.id}-quantity`}>Quantity</FieldLabel><Input id={`${fieldId}-${entry.id}-quantity`} type="number" min="1" step="1" value={entry.quantity} onChange={(event) => update({ quantity: event.currentTarget.value })} /></Field>
            </div>
            <Field><FieldLabel htmlFor={`${fieldId}-${entry.id}-note`}>Player-facing note</FieldLabel><Input id={`${fieldId}-${entry.id}-note`} value={entry.note} onChange={(event) => update({ note: event.currentTarget.value })} /></Field>
            <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, entries: draft.entries.filter((item) => item.id !== entry.id) })}><Trash2Icon data-icon="inline-start" />Remove entry</Button>
          </FieldGroup></section>;
        })}
        <Button variant="outline" onClick={() => setDraft({ ...draft, entries: [...draft.entries, { id: crypto.randomUUID(), name: "", kind: "item", quantity: "1", note: "" }] })}><PlusIcon data-icon="inline-start" />Add entry</Button>
      </div></CardContent></Card>
    </div> : <InventoryView inventory={inventory} />}
  </article>;
}
