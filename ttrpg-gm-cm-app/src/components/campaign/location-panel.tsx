import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ChevronRightIcon, MapIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { NpcRecordLinks } from "@/components/campaign/npc-record-links";
import { LocationCreateForm, LocationParentField, LocationSelect } from "@/components/campaign/location-fields";
import { locationIcon } from "@/components/campaign/location-icon";
import { appCommands } from "@/lib/app-commands";
import { createLocation, saveLocation, useCampaign } from "@/lib/campaign-data";
import { canParentLocation, hasLocationChanges, locationAncestors, withLocationDefaults, type LocationReference } from "@/lib/location-data";

function LocationSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="min-w-0">
    <Card>
      <CardHeader>
        <CardTitle variant="dossier"><h2 id={id}>{title}</h2></CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent><div className="flex flex-col gap-3"><Separator />{children}</div></CardContent>
    </Card>
  </section>;
}

const referenceFields: { key: keyof LocationReference; label: string; placeholder: string }[] = [
  { key: "atmosphere", label: "Atmosphere", placeholder: "Sounds, smells, sights, and the feeling of this place…" },
  { key: "background", label: "Background", placeholder: "History, ownership, and why this place matters…" },
  { key: "currentSituation", label: "What is happening now", placeholder: "Current tensions, activity, and changes…" },
  { key: "secrets", label: "Secrets and discoveries", placeholder: "Hidden details, clues, and surprises…" },
];
const knowledgeLabels = { unknown: "Unknown", known: "Known", visited: "Visited" };

export function LocationPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.locationId === "string" ? params.locationId : "";
  const locations = useCampaign((state) => state.campaign.locations);
  const npcs = useCampaign((state) => state.campaign.npcs);
  const factions = useCampaign((state) => state.campaign.factions);
  const location = locations.find((item) => item.id === id);
  const [draft, setDraft] = useState(location ? withLocationDefaults(location) : undefined);
  const [editing, setEditing] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [stagedChildren, setStagedChildren] = useState<{ name: string; parentId: string | null }[]>([]);
  const [tagsText, setTagsText] = useState(location?.tags?.join(", ") ?? "");
  const [error, setError] = useState("");
  const [isWide, setIsWide] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);

  useEffect(() => {
    setDraft(location ? withLocationDefaults(structuredClone(location)) : undefined);
    setTagsText(location?.tags?.join(", ") ?? "");
    setEditing(false);
    setStagedChildren([]);
    setError("");
    if (location) api.setTitle(location.name);
  }, [location, api]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateWidth = () => setIsWide(element.clientWidth >= 900);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    const frame = requestAnimationFrame(() => { element.scrollTop = initialScroll.current; });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  if (!location || !draft) return <article className="h-full overflow-auto p-8">This location is no longer available.</article>;
  const saved = withLocationDefaults(location);
  const changed = hasLocationChanges(draft, saved, tagsText, stagedChildren);
  const parent = locations.find((item) => item.id === draft.parentId);
  const ancestors = locationAncestors(locations, id);
  const children = locations.filter((item) => item.parentId === id);

  const cancel = () => {
    setDraft(withLocationDefaults(structuredClone(location)));
    setTagsText(saved.tags.join(", "));
    setError("");
    setEditing(false);
    setCreatingChild(false);
    setStagedChildren([]);
  };
  const save = () => {
    const tags = [...new Set(tagsText.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (!saveLocation(id, { ...draft, tags })) { setError("Choose an available parent outside this location's descendants."); return; }
    stagedChildren.forEach(({ name, parentId }) => createLocation(name, parentId));
    setEditing(false);
    setCreatingChild(false);
    setStagedChildren([]);
    setError("");
  };

  const narrative = <div className="@container flex min-w-0 flex-col gap-4">
    {(editing || draft.banner) && <div className="min-w-0">
      {editing ? <NpcImageField label="Scenic banner (GM view)" editable value={draft.banner?.url ?? null}
        aspectRatio="4 / 1" fit="cover" onChange={(url) => setDraft((current) => current ? { ...current, banner: url ? { type: "img", url } : null } : current)} />
        : <img src={draft.banner?.url} alt={`${location.name} scenery`} className="aspect-[4/1] w-full rounded-xl object-cover" />}
    </div>}
    <LocationSection title="Description for Players" action={<Badge variant="public">Public</Badge>}>
      <div className="flex flex-col gap-4 @min-[500px]:flex-row">
        {(editing || draft.image) && <div className="min-w-0 @min-[500px]:w-1/2 @min-[500px]:shrink-0">
          {editing ? <NpcImageField label="Scene image for players" editable value={draft.image?.url ?? null}
            aspectRatio="16 / 9" fit="contain" onChange={(url) => setDraft((current) => current ? { ...current, image: url ? { type: "img", url } : null } : current)} />
            : <img src={draft.image?.url} alt={`Player-facing scene of ${location.name}`} className="aspect-video w-full rounded-lg object-contain" />}
        </div>}
        <div className="min-w-0 flex-1">
          {editing ? <Field><FieldLabel htmlFor={`${id}-description`}>Description for Players</FieldLabel>
            <AutoSizeTextarea id={`${id}-description`} value={draft.publicDescription} placeholder="Describe what players see, hear, and are told…"
              onChange={(event) => setDraft({ ...draft, publicDescription: event.currentTarget.value })} /></Field>
            : <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.publicDescription || "No player description yet."}</p>}
        </div>
      </div>
    </LocationSection>
    <LocationSection title="GM Reference">
      {editing ? <FieldGroup>{referenceFields.map(({ key, label, placeholder }) => <Field key={key}>
        <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
        <AutoSizeTextarea id={`${id}-${key}`} value={draft.gmReference[key]} placeholder={placeholder}
          onChange={(event) => setDraft({ ...draft, gmReference: { ...draft.gmReference, [key]: event.currentTarget.value } })} />
      </Field>)}</FieldGroup> : referenceFields.some(({ key }) => draft.gmReference[key].trim()) ? <dl className="flex flex-col gap-4">
        {referenceFields.filter(({ key }) => draft.gmReference[key].trim()).map(({ key, label }) => <div key={key} className="grid gap-2 @min-[500px]:grid-cols-[10rem_1fr]">
          <dt className="font-serif text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.gmReference[key]}</dd>
        </div>)}
      </dl> : <p className="text-sm text-muted-foreground">Add atmosphere, background, and secrets in Edit.</p>}
    </LocationSection>
    <LocationSection title="GM Notes">
      {editing ? <Field><FieldLabel className="sr-only" htmlFor={`${id}-notes`}>GM notes</FieldLabel>
        <AutoSizeTextarea id={`${id}-notes`} value={draft.gmNotes} placeholder="Session notes, ideas, and reminders…"
          onChange={(event) => setDraft({ ...draft, gmNotes: event.currentTarget.value })} /></Field>
        : <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.gmNotes || "Add your session notes, ideas, and reminders in Edit."}</p>}
    </LocationSection>
  </div>;

  const reference = <div className="flex min-w-0 flex-col gap-4">
    <LocationSection title="At a glance">
      {editing ? <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel><Input id={`${id}-type`} value={draft.locationType} placeholder="Region, City, Tavern, Room…"
          onChange={(event) => setDraft({ ...draft, locationType: event.currentTarget.value })} /></Field>
        <LocationParentField locations={locations} locationId={id} parentId={draft.parentId} onChange={(parentId) => setDraft({ ...draft, parentId })} />
        <LocationSelect label="Party knowledge" value={draft.partyKnowledge} onChange={(value) => {
          if (value === "unknown" || value === "known" || value === "visited") setDraft({ ...draft, partyKnowledge: value });
        }}>{Object.entries(knowledgeLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</LocationSelect>
        <Field><FieldLabel htmlFor={`${id}-tags`}>Tags</FieldLabel><Input id={`${id}-tags`} value={tagsText} placeholder="Separate tags with commas"
          onChange={(event) => setTagsText(event.currentTarget.value)} /></Field>
      </FieldGroup> : <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Type</dt><dd>{draft.locationType || "Unspecified"}</dd>
        <dt className="text-muted-foreground">Parent location</dt><dd className="min-w-0">{parent ? <Button variant="link" size="inline" className="max-w-full justify-start" title={parent.name}
          onClick={() => appCommands.openLocation(parent.id)}><span className="truncate">{parent.name}</span></Button> : "Top-level location"}</dd>
        <dt className="text-muted-foreground">Party knowledge</dt><dd>{knowledgeLabels[draft.partyKnowledge]}</dd>
        <dt className="text-muted-foreground">Tags</dt><dd className="flex min-w-0 flex-wrap gap-1.5">{draft.tags.length ? draft.tags.map((tag) =>
          <Badge key={tag} variant="secondary" className="max-w-full" title={tag}><span className="min-w-0 truncate">{tag}</span></Badge>) : "None"}</dd>
      </dl>}
    </LocationSection>
    <LocationSection title="Maps">
      <Empty size="compact"><EmptyHeader><EmptyTitle>No maps attached</EmptyTitle><EmptyDescription>Maps of this place and its appearances on other maps will be listed here.</EmptyDescription></EmptyHeader></Empty>
      <Button type="button" variant="outline" size="sm" onClick={appCommands.openMap}><MapIcon data-icon="inline-start" />Open map prototype</Button>
    </LocationSection>
    <LocationSection title="Places within" action={editing && <Button type="button" variant="outline" size="sm" onClick={() => setCreatingChild(true)}><PlusIcon data-icon="inline-start" />Add location</Button>}>
      {editing && creatingChild && <LocationCreateForm initialParentId={id} onClose={() => setCreatingChild(false)}
        onStage={(name, parentId) => setStagedChildren((current) => [...current, { name, parentId }])} />}
      {stagedChildren.length > 0 && <ul aria-label="New places to create when changes are saved" className="flex flex-col gap-1">
        {stagedChildren.map((child, index) => <li key={`${child.name}-${index}`} className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm">
          <span>{child.name}</span><Button type="button" variant="ghost" size="sm" onClick={() => setStagedChildren((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
        </li>)}
      </ul>}
      {children.length ? <ul className="flex flex-col gap-1">{children.map((child) => {
        const Icon = locationIcon(child.locationType);
        return <li key={child.id}><Button variant="ghost" className="h-auto min-h-9 w-full justify-start" title={child.name} onClick={() => appCommands.openLocation(child.id)}>
          <Icon data-icon="inline-start" /><span className="min-w-0 flex-1 truncate text-left">{child.name}</span>
          {child.locationType && <span className="max-w-20 truncate text-xs text-muted-foreground">{child.locationType}</span>}<ChevronRightIcon data-icon="inline-end" />
        </Button></li>;
      })}</ul> : <p className="text-sm text-muted-foreground">No places within this location yet.</p>}
    </LocationSection>
    <NpcRecordLinks key={`location-npcs-${id}-${editing}`} kind="npc" sourceNpcId={id} records={npcs}
      value={draft.associatedNpcs} editable={editing} heading="Associated NPCs" addLabel="NPC" fieldLabel="Association"
      onChange={(associatedNpcs) => setDraft({ ...draft, associatedNpcs })} />
    <NpcRecordLinks key={`location-factions-${id}-${editing}`} kind="faction" sourceNpcId={id} records={factions}
      value={draft.associatedFactions} editable={editing} onChange={(associatedFactions) => setDraft({ ...draft, associatedFactions })} />
  </div>;

  return <article ref={scrollRef} className="@container h-full overflow-auto p-6 sm:p-8" onScroll={(event) => {
    api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
    window.dispatchEvent(new Event("campaign-workspace-change"));
  }}>
    {ancestors.length > 0 && <nav aria-label="Location breadcrumbs" className="mb-3"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {ancestors.map((ancestor) => <li key={ancestor.id} className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="link" size="inline" className="max-w-48" title={ancestor.name} onClick={() => appCommands.openLocation(ancestor.id)}><span className="truncate">{ancestor.name}</span></Button><span aria-hidden="true">/</span>
      </li>)}<li aria-current="page" className="max-w-48 truncate">{location.name}</li>
    </ol></nav>}
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {editing ? <Field><FieldLabel htmlFor={`${id}-name`}>Location name</FieldLabel><Input id={`${id}-name`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></Field>
          : <><h1 className="break-words font-serif text-3xl font-semibold">{location.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{[draft.locationType || "Location", parent?.name].filter(Boolean).join(" · ")}</p></>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? <>{changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button variant="outline" onClick={cancel}>Cancel</Button>
          <Button disabled={!changed || !draft.name.trim() || !canParentLocation(locations, id, draft.parentId)} onClick={save}>Save changes</Button>
        </> : <Button variant="outline" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" />Edit</Button>}
      </div>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {isWide ? <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-start gap-4">{narrative}{reference}</div>
      : <div className="flex flex-col gap-4">{narrative}{reference}</div>}
  </article>;
}
