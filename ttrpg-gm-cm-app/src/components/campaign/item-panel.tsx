import { useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { NpcImageField } from "./npc-image-field";
import { AddItemFieldDialog, ItemPropertyInput } from "./item-fields";
import { formatItemValue, itemError, type CampaignItem } from "@/lib/item-data";
import { removeItem, saveItem, useCampaign } from "@/lib/campaign-data";
import { useItemDrafts } from "@/stores/item-drafts";

export function ItemPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.itemId === "string" ? params.itemId : "";
  const item = useCampaign((state) => state.campaign.items?.find((record) => record.id === id));
  const definitions = useCampaign((state) => state.campaign.itemFields);
  const draft = useItemDrafts((state) => state.drafts[id]);
  const [imagePending, setImagePending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => { if (item) api.setTitle(item.name); }, [item, api]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = initialScroll.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!item) return <article className="p-6">This item is no longer available.</article>;
  const editing = !!draft;
  const current = draft?.item ?? item;
  const fields = [...(definitions ?? []), ...(draft?.fields ?? [])];
  const attached = fields.filter((field) => Object.prototype.hasOwnProperty.call(current.values, field.id));
  const change = (changes: Partial<CampaignItem>) => {
    const latest = useItemDrafts.getState().drafts[id];
    if (latest) useItemDrafts.getState().setDraft({ ...latest, item: { ...latest.item, ...changes } });
    setError(null);
  };
  const cancel = () => { useItemDrafts.getState().discard(id); setAdding(false); setError(null); };
  const save = () => {
    if (!draft || imagePending) return;
    const problem = saveItem(draft.item, draft.fields);
    setError(problem);
    if (!problem) useItemDrafts.getState().discard(id);
  };
  return <article ref={scroll} className="h-full overflow-auto p-4 md:p-6" onScroll={(event) => {
    api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
    window.dispatchEvent(new Event("campaign-workspace-change"));
  }}><div className="mx-auto flex max-w-3xl flex-col gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <h1 className="min-w-0 break-words font-serif text-3xl font-semibold">{item.name}</h1>
      <div className="flex gap-2">
        {!editing && <Button variant="outline" onClick={() => useItemDrafts.getState().setDraft({ item, fields: [] })}><PencilIcon data-icon="inline-start" />Edit</Button>}
        <Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(true)}><Trash2Icon /></Button>
      </div>
    </header>
    {editing && <Field data-invalid={!current.name.trim()}><FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel><Input id={`${id}-name`} required aria-invalid={!current.name.trim()} value={current.name} onChange={(event) => change({ name: event.currentTarget.value })} /></Field>}
    {(editing || current.image) && <NpcImageField editable={editing} label="Item image" onPendingChange={setImagePending} value={current.image?.url ?? null} aspectRatio="16 / 7" onChange={(url) => change({ image: url ? { type: "img", url } : null })} />}
    {editing ? <Field><FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel><AutoSizeTextarea id={`${id}-description`} value={current.description} onChange={(event) => change({ description: event.currentTarget.value })} /></Field>
      : current.description && <p className="whitespace-pre-wrap break-words text-sm leading-6">{current.description}</p>}
    {(editing || attached.length > 0) && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle variant="dossier">Properties</CardTitle>{editing && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><PlusIcon data-icon="inline-start" />Add field</Button>}</div></CardHeader><CardContent>
      {!attached.length && <p className="text-sm text-muted-foreground">No properties added. All fields are optional.</p>}
      {editing ? <FieldGroup>{attached.map((field) => <div key={field.id} className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><ItemPropertyInput field={field} value={current.values[field.id]} onChange={(value) => change({ values: { ...current.values, [field.id]: value } })} /></div>
        <Button variant="ghost" size="icon" aria-label={`Remove ${field.label} from this item`} onClick={() => {
          const values = { ...current.values }; delete values[field.id]; change({ values });
        }}><Trash2Icon /></Button></div>)}</FieldGroup>
        : <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-3 text-sm">{attached.map((field) => <div key={field.id} className="contents"><dt className="break-words text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{formatItemValue(field, current.values[field.id])}</dd></div>)}</dl>}
    </CardContent></Card>}
    {(editing || current.gmNotes) && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle variant="dossier">GM notes</CardTitle><Badge variant="outline"><LockIcon data-icon="inline-start" />GM only</Badge></div></CardHeader><CardContent>
      {editing ? <Field><FieldLabel className="sr-only" htmlFor={`${id}-notes`}>GM notes</FieldLabel><AutoSizeTextarea id={`${id}-notes`} value={current.gmNotes} onChange={(event) => change({ gmNotes: event.currentTarget.value })} /></Field>
        : <p className="whitespace-pre-wrap break-words text-sm leading-6">{current.gmNotes}</p>}
    </CardContent></Card>}
    {error && <FieldError role="alert">{error}</FieldError>}
    {editing && <div className="flex justify-end gap-2"><Button variant="outline" onClick={cancel}>Cancel</Button><Button onClick={save} disabled={imagePending || !!itemError(current, fields)}>Save changes</Button></div>}
  </div>
    {adding && draft && <AddItemFieldDialog fields={fields} attachedIds={Object.keys(current.values)} onClose={() => setAdding(false)} onAdd={(field, isNew) => {
      useItemDrafts.getState().setDraft({ fields: isNew ? [...draft.fields, field] : draft.fields,
        item: { ...current, values: { ...current.values, [field.id]: field.kind === "checkbox" ? false : null } } });
    }} />}
    <Dialog open={deleting} onOpenChange={setDeleting}><DialogPopup><DialogTitle>Delete {item.name}?</DialogTitle><DialogDescription>This removes the item and its property values from the catalog. Shared field definitions and party inventory entries are kept.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="destructive" onClick={() => {
      if (removeItem(id)) { useItemDrafts.getState().discard(id); setDeleting(false); }
    }}>Delete item</Button></div></DialogPopup></Dialog>
  </article>;
}
