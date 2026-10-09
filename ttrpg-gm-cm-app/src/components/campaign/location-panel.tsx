import { useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { saveLocation, useCampaign } from "@/lib/campaign-data";

export function LocationPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.locationId === "string" ? params.locationId : "";
  const location = useCampaign((state) => state.campaign.locations?.find((item) => item.id === id));
  const [draft, setDraft] = useState(location);
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => {
    setDraft(location ? structuredClone(location) : undefined);
    setEditing(false);
    if (location) api.setTitle(location.name);
  }, [location, api]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScroll.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!location || !draft) return <article className="h-full overflow-auto p-8">This location is no longer available.</article>;
  const changed = JSON.stringify(draft) !== JSON.stringify(location);
  return (
    <article ref={scrollRef} className="flex h-full flex-col gap-5 overflow-auto p-8" onScroll={(event) => {
      api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
      window.dispatchEvent(new Event("campaign-workspace-change"));
    }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</p>
          {editing ? <Input aria-label="Location name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /> : <h1 className="font-serif text-2xl font-semibold">{location.name}</h1>}
        </div>
        <div className="flex gap-2">
          {editing ? <>
            <Button variant="outline" onClick={() => { setDraft(structuredClone(location)); setEditing(false); }}>Cancel</Button>
            <Button disabled={!changed || !draft.name.trim()} onClick={() => { saveLocation(id, draft); setEditing(false); }}>Save changes</Button>
          </> : <Button variant="outline" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" /> Edit</Button>}
        </div>
      </header>
      {(editing || draft.image) && <NpcImageField label="Location image" editable={editing} value={draft.image?.url ?? null} aspectRatio="16 / 9" fit="contain" onChange={(url) => setDraft({ ...draft, image: url ? { type: "img", url } : null })} />}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>Public description</FieldLabel>
          {editing ? <AutoSizeTextarea id={`${id}-description`} value={draft.publicDescription} placeholder="Describe this place for players…" onChange={(event) => setDraft({ ...draft, publicDescription: event.currentTarget.value })} /> : <p className="whitespace-pre-wrap text-sm leading-6">{draft.publicDescription || "No public description yet."}</p>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-notes`}>GM notes</FieldLabel>
          {editing ? <AutoSizeTextarea id={`${id}-notes`} value={draft.gmNotes} placeholder="Private details, secrets, and reminders…" onChange={(event) => setDraft({ ...draft, gmNotes: event.currentTarget.value })} /> : <p className="whitespace-pre-wrap text-sm leading-6">{draft.gmNotes || "No GM notes yet."}</p>}
        </Field>
      </FieldGroup>
    </article>
  );
}
