import { useEffect, useId, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ArrowDownIcon, ArrowUpIcon, PackageIcon, PlusIcon, Settings2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createItem, getCampaign, useCampaign } from "@/lib/campaign-data";
import { appCommands } from "@/lib/app-commands";
import { compareItems, formatItemValue, matchingItems, type ItemFieldDefinition } from "@/lib/item-data";
import { useItemDrafts } from "@/stores/item-drafts";

function NewItemDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const id = useId();
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPopup>
    <DialogTitle>New item</DialogTitle><DialogDescription>Start with a name. Images, notes, and properties are optional.</DialogDescription>
    <form className="flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      const id = createItem(name);
      if (!id) return;
      const item = getCampaign().campaign.items!.find((record) => record.id === id)!;
      useItemDrafts.getState().setDraft({ item, fields: [] });
      onClose(); appCommands.openItem(id);
    }}><Field><FieldLabel htmlFor={id}>Name</FieldLabel><Input id={id} autoFocus required value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Create item</Button></div>
    </form>
  </DialogPopup></Dialog>;
}

export function ItemsCatalog({ params, api }: IDockviewPanelProps) {
  const items = useCampaign((state) => state.campaign.items);
  const fields = useCampaign((state) => state.campaign.itemFields);
  const definitions = fields ?? [];
  const [query, setQuery] = useState(typeof params.query === "string" ? params.query : "");
  const [columns, setColumns] = useState<string[]>(Array.isArray(params.columnIds) ? params.columnIds.filter((id: unknown): id is string => typeof id === "string") : definitions.slice(0, 2).map((field) => field.id));
  const [sortKey, setSortKey] = useState(typeof params.sortKey === "string" ? params.sortKey : "name");
  const [descending, setDescending] = useState(params.descending === true);
  const [selectedId, setSelectedId] = useState<string | null>(typeof params.selectedItemId === "string" ? params.selectedItemId : null);
  const [creating, setCreating] = useState(false);
  const [viewOptions, setViewOptions] = useState(false);
  const scroll = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  const searchId = useId();
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = initialScroll.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  const remember = (change: Record<string, unknown>) => {
    api.updateParameters(change);
    window.dispatchEvent(new Event("campaign-workspace-change"));
  };
  const sortField = definitions.find((field) => field.id === sortKey);
  const visibleFields = columns.map((id) => definitions.find((field) => field.id === id)).filter((field): field is ItemFieldDefinition => !!field);
  const matches = matchingItems(items ?? [], query).sort((a, b) => compareItems(a, b, sortField, descending));
  const sort = (key: string) => {
    const next = key === sortKey ? !descending : false;
    setSortKey(key); setDescending(next); remember({ sortKey: key, descending: next });
  };
  const open = (id: string) => { setSelectedId(id); remember({ selectedItemId: id }); appCommands.openItem(id); };
  const sortIcon = (key: string) => sortKey === key ? descending ? <ArrowDownIcon data-icon="inline-end" /> : <ArrowUpIcon data-icon="inline-end" /> : null;
  return <main ref={scroll} className="h-full overflow-auto p-4 md:p-6" onScroll={(event) => remember({ scrollTop: event.currentTarget.scrollTop })}>
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-col gap-1"><h1 className="font-serif text-3xl font-semibold">Items</h1><p className="text-sm text-muted-foreground">Item catalog</p></div><Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />New item</Button></header>
      <section aria-label="Item catalog" className="min-w-0 overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-end gap-3 border-b p-3"><div className="min-w-40 flex-1"><Field><FieldLabel className="sr-only" htmlFor={searchId}>Search items</FieldLabel><Input id={searchId} type="search" placeholder="Search items…" value={query} onChange={(event) => { setQuery(event.currentTarget.value); remember({ query: event.currentTarget.value }); }} /></Field></div>
          <Button variant="outline" onClick={() => setViewOptions(true)}><Settings2Icon data-icon="inline-start" />View options</Button>
        </div>
        {matches.length ? <Table>
          <TableHeader><TableRow><TableHead pinned aria-sort={sortKey === "name" ? descending ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => sort("name")}>Name{sortIcon("name")}</Button></TableHead>
            {visibleFields.map((field) => <TableHead key={field.id} aria-sort={sortKey === field.id ? descending ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => sort(field.id)}>{field.label}{sortIcon(field.id)}</Button></TableHead>)}
          </TableRow></TableHeader>
          <TableBody>{matches.map((item) => <TableRow key={item.id} data-state={selectedId === item.id ? "selected" : undefined} onClick={() => open(item.id)}>
            <TableCell pinned><Button variant="ghost" className="h-auto w-full justify-start" onClick={(event) => { event.stopPropagation(); open(item.id); }}>
              {item.image ? <img src={item.image.url} alt="" loading="lazy" className="size-10 shrink-0 rounded-md object-cover" /> : <PackageIcon data-icon="inline-start" />}
              <span className="max-w-60 truncate">{item.name}</span>
            </Button></TableCell>
            {visibleFields.map((field) => <TableCell key={field.id}><span className="block max-w-48 truncate" title={formatItemValue(field, item.values[field.id])}>{formatItemValue(field, item.values[field.id])}</span></TableCell>)}
          </TableRow>)}</TableBody>
        </Table> : <Empty><EmptyHeader><EmptyTitle>{query ? "No matching items" : "No items yet"}</EmptyTitle><EmptyDescription>{query ? "Try another name." : "Create an item with just a name, then add the details you need."}</EmptyDescription></EmptyHeader></Empty>}
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground">{matches.length} {matches.length === 1 ? "item" : "items"}{query ? ` of ${items?.length ?? 0}` : ""}</footer>
      </section>
    </div>
    {creating && <NewItemDialog onClose={() => setCreating(false)} />}
    <Dialog open={viewOptions} onOpenChange={setViewOptions}><DialogPopup><DialogTitle>Catalog columns</DialogTitle><DialogDescription>Name is always shown. Choose which optional fields to display.</DialogDescription>
      <FieldSet><FieldLegend>Properties</FieldLegend><FieldGroup>{definitions.length ? definitions.map((field) => <Field key={field.id} orientation="horizontal"><Checkbox id={`${searchId}-${field.id}`} checked={columns.includes(field.id)} onCheckedChange={(checked) => {
        const next = checked ? [...columns, field.id] : columns.filter((id) => id !== field.id);
        setColumns(next); remember({ columnIds: next });
      }} /><FieldLabel htmlFor={`${searchId}-${field.id}`}>{field.label}</FieldLabel></Field>) : <p className="text-sm text-muted-foreground">Add a property while editing an item to make it available here.</p>}</FieldGroup></FieldSet>
      <div className="flex justify-end"><Button onClick={() => setViewOptions(false)}>Done</Button></div>
    </DialogPopup></Dialog>
  </main>;
}
