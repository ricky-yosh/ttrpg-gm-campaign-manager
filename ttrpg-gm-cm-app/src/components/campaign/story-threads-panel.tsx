import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ArrowLeftIcon, ArrowRightIcon, PencilIcon, PlusIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { SidebarSectionHeading } from "@/components/campaign/sidebar-section-heading";
import { NotesField } from "@/components/campaign/notes-field";
import { appCommands } from "@/lib/app-commands";
import { createThread, saveThread, useCampaign } from "@/lib/campaign-data";
import { matchingThreads, threadStatuses, type StoryThread, type ThreadLink } from "@/lib/story-thread-data";
import { useThreadDrafts } from "@/stores/story-thread-drafts";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

function NewThreadForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const id = useId();
  return <form onSubmit={(event) => {
    event.preventDefault();
    const threadId = createThread(title);
    if (!threadId) return;
    onDone();
    appCommands.openThread(threadId);
  }}><FieldGroup><Field><FieldLabel htmlFor={id}>Thread title</FieldLabel><Input id={id} autoFocus required value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!title.trim()}>Create</Button><Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button></div>
  </FieldGroup></form>;
}

export function StoryThreadsSidebar() {
  const threads = useCampaign((state) => state.campaign.threads);
  const [creating, setCreating] = useState(false);
  return <>
    <SidebarMenuItem><SidebarSectionHeading title="Story Threads" actionLabel="New thread" onCreate={() => setCreating(true)} className="px-2 pb-3 pt-4 group-data-[collapsible=icon]:hidden" />
      <SidebarMenuButton className="hidden group-data-[collapsible=icon]:flex" tooltip="New thread" onClick={() => { useSessionStore.getState().setSidebar({ open: true }); setCreating(true); }}><PlusIcon /><span>New thread</span></SidebarMenuButton>
      <SidebarMenuButton tooltip="All threads" onClick={appCommands.openThreads}><ScrollTextIcon /><span>All threads</span></SidebarMenuButton>
    </SidebarMenuItem>
    {creating && <li className="p-2"><NewThreadForm onDone={() => setCreating(false)} /></li>}
    {!threads?.length && <li className="p-2 group-data-[collapsible=icon]:hidden"><Empty size="compact"><EmptyHeader><EmptyTitle>No threads yet</EmptyTitle></EmptyHeader></Empty></li>}
    {(threads ?? []).map((thread) => <SidebarMenuItem key={thread.id}><SidebarMenuButton tooltip={thread.title} onClick={() => appCommands.openThread(thread.id)}><ScrollTextIcon /><span>{thread.title}</span></SidebarMenuButton></SidebarMenuItem>)}
  </>;
}

function ThreadDirectory() {
  const threads = useCampaign((state) => state.campaign.threads);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const id = useId();
  const matches = matchingThreads(threads ?? [], query);
  return <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 @lg/thread:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-1"><h1 className="font-serif text-3xl font-semibold">Story Threads</h1><p className="text-sm text-muted-foreground">Keep the people, places, and loose ends of your campaign together.</p></div><Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />New thread</Button></header>
    {creating && <NewThreadForm onDone={() => setCreating(false)} />}
    <Field><FieldLabel htmlFor={id}>Search threads</FieldLabel><Input id={id} type="search" value={query} placeholder="Search by title or origin…" onChange={(event) => setQuery(event.currentTarget.value)} /></Field>
    {!matches.length && <Empty><EmptyHeader><EmptyTitle>{query ? "No matching threads" : "No story threads yet"}</EmptyTitle><EmptyDescription>{query ? "Try another title or origin." : "Start with a title and the hook that brought it into your campaign."}</EmptyDescription></EmptyHeader></Empty>}
    {(["active", "idea", "onHold", "resolved"] as const).map((status) => {
      const group = matches.filter((thread) => thread.status === status);
      if (!group.length) return null;
      const heading = <><span>{status === "idea" ? "Ideas" : threadStatuses[status]}</span><Badge variant="secondary">{group.length}</Badge></>;
      const rows = <ul className="flex flex-col gap-2 pt-3">{group.map((thread) => <li key={thread.id}>
        <Button variant="outline" size="lg" className="h-auto w-full justify-start" onClick={() => appCommands.openThread(thread.id)}>
          <ScrollTextIcon />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="w-full truncate text-left">{thread.title}</span>
            {thread.playerReminder && <span className="w-full truncate text-left text-xs text-muted-foreground">{thread.playerReminder}</span>}
          </span>
          <Badge variant="secondary">{threadStatuses[thread.status]}</Badge>
        </Button>
      </li>)}</ul>;
      return status === "resolved"
        ? <Collapsible key={status} open={!!query || resolvedOpen} onOpenChange={setResolvedOpen}>
          <CollapsibleTrigger render={<Button variant="ghost" />}>{heading}</CollapsibleTrigger>
          <CollapsibleContent>{rows}</CollapsibleContent>
        </Collapsible>
        : <section key={status}><h2 className="flex items-center gap-2 font-semibold">{heading}</h2>{rows}</section>;
    })}
  </div>;
}

function ThreadSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle variant="dossier"><h2>{title}</h2></CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent>{children}</CardContent></Card>;
}

function ThreadConnections({ title, singular, records, links, editable, onChange, onOpen }: {
  title: string; singular: string; records: { id: string; name: string }[]; links: ThreadLink[]; editable: boolean;
  onChange: (links: ThreadLink[]) => void; onOpen: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const id = useId();
  const available = records.filter((record) => !links.some((link) => link.targetId === record.id));
  return <ThreadSection title={title}><div className="flex flex-col gap-3">
    {!links.length && <p className="text-sm text-muted-foreground">None linked yet.</p>}
    <ul className="flex flex-col gap-4">{links.map((link) => {
      const target = records.find((record) => record.id === link.targetId);
      const name = target?.name ?? `Unavailable ${singular}`;
      return <li key={link.targetId} className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-1"><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal text-left" disabled={!target} onClick={() => onOpen(link.targetId)}>{name}<ArrowRightIcon data-icon="inline-end" /></Button>
          {editable && <Button variant="ghost" size="icon-sm" aria-label={`Remove link to ${name}`} onClick={() => onChange(links.filter((item) => item.targetId !== link.targetId))}><Trash2Icon /></Button>}</div>
        {editable ? <Field><FieldLabel className="sr-only" htmlFor={`${id}-${link.targetId}`}>Involvement of {name}</FieldLabel><AutoSizeTextarea id={`${id}-${link.targetId}`} value={link.label} placeholder="Why this matters…" onChange={(event) => onChange(links.map((item) => item.targetId === link.targetId ? { ...item, label: event.currentTarget.value } : item))} /></Field>
          : link.label && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{link.label}</p>}
      </li>;
    })}</ul>
    {editable && !adding && <Button variant="outline" size="sm" disabled={!available.length} onClick={() => setAdding(true)}><PlusIcon data-icon="inline-start" />Add {singular}</Button>}
    {editable && adding && <FieldGroup>
      <Field><FieldLabel htmlFor={`${id}-target`}>Choose {singular}</FieldLabel><NativeSelect id={`${id}-target`} value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)}><NativeSelectOption value="">Choose a record…</NativeSelectOption>{available.map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-context`}>Involvement / Why this matters</FieldLabel><AutoSizeTextarea id={`${id}-context`} value={label} onChange={(event) => setLabel(event.currentTarget.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!available.some((record) => record.id === targetId)} onClick={() => { onChange([...links, { targetId, label: label.trim() }]); setAdding(false); setTargetId(""); setLabel(""); }}>Add</Button><Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTargetId(""); setLabel(""); }}>Cancel</Button></div>
    </FieldGroup>}
  </div></ThreadSection>;
}

function ThreadPage({ id, api }: { id: string; api: IDockviewPanelProps["api"] }) {
  const thread = useCampaign((state) => state.campaign.threads?.find((item) => item.id === id));
  const npcs = useCampaign((state) => state.campaign.npcs);
  const locations = useCampaign((state) => state.campaign.locations);
  const factions = useCampaign((state) => state.campaign.factions);
  const draft = useThreadDrafts((state) => state.drafts[id]);
  const record = draft ?? thread;
  const editing = !!draft;
  const [error, setError] = useState("");
  const [wide, setWide] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(typeof api.getParameters()?.scrollTop === "number" ? api.getParameters().scrollTop : 0);
  const fieldId = useId();
  useEffect(() => { if (thread) api.setTitle(thread.title); }, [api, thread]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    element.scrollTop = initialScroll.current;
    const observer = new ResizeObserver(() => setWide(element.clientWidth >= 900));
    setWide(element.clientWidth >= 900);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (!thread || !record) return <Empty><EmptyHeader><EmptyTitle>Thread unavailable</EmptyTitle><EmptyDescription>This thread is no longer in the campaign.</EmptyDescription></EmptyHeader></Empty>;
  const update = (change: Partial<StoryThread>) => useThreadDrafts.getState().setDraft({ ...record, ...change });
  const changed = editing && JSON.stringify(draft) !== JSON.stringify(thread);
  const shortField = (key: "playerReminder" | "origin" | "sourceLabel", label: string, placeholder: string) => editing
    ? <Field><FieldLabel htmlFor={`${fieldId}-${key}`}>{label}</FieldLabel><AutoSizeTextarea id={`${fieldId}-${key}`} value={record[key]} placeholder={placeholder} onChange={(event) => update({ [key]: event.currentTarget.value })} /></Field>
    : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{record[key] || placeholder}</p>;
  const reminder = <ThreadSection title="Player reminder" description="A reminder you can read or paraphrase for the players.">{shortField("playerReminder", "Player reminder", "What can you remind the players of without revealing a secret?")}</ThreadSection>;
  const origin = <ThreadSection title="How it started"><FieldGroup>{shortField("origin", "Origin", "What brought this into the campaign?")}{editing ? shortField("sourceLabel", "Source (optional)", "Rumor, discovery, encounter, backstory…") : record.sourceLabel && <p className="text-xs text-muted-foreground">Source: {record.sourceLabel}</p>}</FieldGroup></ThreadSection>;
  const notes = <>
    <NotesField id={`${id}:situation`} title="Where things stand" value={record.currentSituation} editable={editing} onChange={(currentSituation) => update({ currentSituation })} description="Current situation and unresolved loose ends · GM only" />
    <NotesField id={`${id}:possibilities`} title="GM possibilities" value={record.gmPossibilities} editable={editing} onChange={(gmPossibilities) => update({ gmPossibilities })} description="Motives, secrets, pressures, and possible developments" />
  </>;
  const connections = <>
    <ThreadConnections key={`people:${editing}`} title="People involved" singular="person" records={npcs} links={record.people} editable={editing} onChange={(people) => update({ people })} onOpen={appCommands.openCharacter} />
    <ThreadConnections key={`locations:${editing}`} title="Locations involved" singular="location" records={locations} links={record.locations} editable={editing} onChange={(locations) => update({ locations })} onOpen={appCommands.openLocation} />
    <ThreadConnections key={`factions:${editing}`} title="Factions involved" singular="faction" records={factions} links={record.factions} editable={editing} onChange={(factions) => update({ factions })} onOpen={appCommands.openFaction} />
  </>;
  return <div ref={scroll} className="@container/thread h-full overflow-auto" onScroll={(event) => { api.updateParameters({ scrollTop: event.currentTarget.scrollTop }); window.dispatchEvent(new Event("campaign-workspace-change")); }}><div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 @lg/thread:p-8">
    <div><Button variant="ghost" size="sm" onClick={appCommands.openThreads}><ArrowLeftIcon data-icon="inline-start" />Story Threads</Button></div>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 flex-1 flex-col gap-3">
      {editing ? <FieldGroup><Field data-invalid={!record.title.trim()}><FieldLabel htmlFor={`${fieldId}-title`}>Title</FieldLabel><Input id={`${fieldId}-title`} aria-invalid={!record.title.trim()} value={record.title} onChange={(event) => update({ title: event.currentTarget.value })} />{!record.title.trim() && <FieldError>Give this thread a title.</FieldError>}</Field>
        <Field><FieldLabel htmlFor={`${fieldId}-status`}>Status</FieldLabel><NativeSelect id={`${fieldId}-status`} value={record.status} onChange={(event) => update({ status: event.currentTarget.value as StoryThread["status"] })}>{Object.entries(threadStatuses).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field></FieldGroup>
        : <><h1 className="break-words font-serif text-3xl font-semibold">{record.title}</h1><div><Badge variant="secondary">{threadStatuses[record.status]}</Badge></div></>}
    </div><div className="flex flex-wrap items-center gap-2">
      {editing ? <>{changed && <Badge variant="outline">Unsaved changes</Badge>}<Button variant="outline" onClick={() => { useThreadDrafts.getState().discard(id); setError(""); }}>Cancel</Button><Button disabled={!record.title.trim()} onClick={() => { const failure = saveThread(record); setError(failure ?? ""); if (!failure) useThreadDrafts.getState().discard(id); }}>Save changes</Button></>
        : <Button variant="outline" onClick={() => useThreadDrafts.getState().setDraft(thread)}><PencilIcon data-icon="inline-start" />Edit</Button>}
    </div></header>
    {error && <FieldError role="alert">{error}</FieldError>}
    <div className={cn("flex flex-col gap-5", wide && "grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]")}>
      {wide ? <><div className="flex min-w-0 flex-col gap-5">{reminder}{origin}{notes}</div><div className="flex min-w-0 flex-col gap-5">{connections}</div></> : <>{reminder}{origin}{connections}{notes}</>}
    </div>
  </div></div>;
}

export function StoryThreadsPanel({ params, api }: IDockviewPanelProps) {
  const directoryScroll = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (directoryScroll.current) directoryScroll.current.scrollTop = initialScroll.current;
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  if (typeof params.threadId === "string") return <ThreadPage key={params.threadId} id={params.threadId} api={api} />;
  return <div ref={directoryScroll} className="@container/thread h-full overflow-auto" onScroll={(event) => {
    api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
    window.dispatchEvent(new Event("campaign-workspace-change"));
  }}><ThreadDirectory /></div>;
}
