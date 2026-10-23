import { useEffect, useId, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import type { Value } from "platejs";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, BookOpenIcon, CalendarIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesField } from "@/components/campaign/notes-field";
import { appCommands } from "@/lib/app-commands";
import { useCampaign } from "@/lib/campaign-data";
import { useSessionNotesStore, type SessionNote, type SessionBeat, type SessionRecordLink } from "@/stores/session-notes-store";

const recordKinds = { npc: "NPCs", location: "Locations", faction: "Factions", thread: "Story threads", puzzle: "Puzzles" };
const emptyNotes = (): Value => [{ type: "p", children: [{ text: "" }] }];

function SessionDirectory() {
  const sessions = useSessionNotesStore((state) => state.sessions);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const matching = sessions.filter((session) => `${session.number} ${session.title}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 @lg/session:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-1">
      <h1 className="font-serif text-3xl font-semibold">Sessions</h1><p className="text-sm text-muted-foreground">Plan, run, and record your game sessions.</p>
    </div><Button onClick={() => appCommands.openSession(useSessionNotesStore.getState().createSession())}><PlusIcon data-icon="inline-start" />New session</Button></header>
    <p className="text-xs text-muted-foreground">Frontend prototype · Sessions and drafts stay in memory until you reload or switch campaigns.</p>
    <Field><FieldLabel htmlFor={searchId}>Search sessions</FieldLabel><Input id={searchId} type="search" value={query} placeholder="Search by title or session number…" onChange={(event) => setQuery(event.currentTarget.value)} /></Field>
    {([false, true] as const).map((previous) => {
      const group = matching.filter((session) => session.previous === previous).sort((a, b) => previous ? b.number - a.number : a.number - b.number);
      return <section key={String(previous)} className="flex flex-col gap-3"><h2 className="flex items-center gap-2 font-semibold">{previous ? "Previous" : "Upcoming"}<Badge variant="secondary">{group.length}</Badge></h2>
        {group.length ? <ul className="flex flex-col gap-2">{group.map((session) => <li key={session.id}>
          <Button variant="outline" size="lg" className="h-auto w-full justify-start" onClick={() => appCommands.openSession(session.id)}>
            <BookOpenIcon aria-hidden="true" /><span className="flex min-w-0 flex-1 flex-col items-start gap-1"><span className="w-full truncate text-left">Session {session.number} — {session.title}</span>
              <span className="text-xs text-muted-foreground">{session.date || "No date set"}</span></span>
          </Button>
        </li>)}</ul> : <Empty size="compact"><EmptyHeader><EmptyTitle>{query ? "No matches" : previous ? "No previous sessions" : "No upcoming sessions"}</EmptyTitle><EmptyDescription>{query ? "Try another title or number." : previous ? "Completed sessions will appear here." : "Create a session to start your prep."}</EmptyDescription></EmptyHeader></Empty>}
      </section>;
    })}
  </div>;
}

function SessionLinks({ links, editable, onChange }: { links: SessionRecordLink[]; editable: boolean; onChange: (links: SessionRecordLink[]) => void }) {
  const threads = useCampaign((state) => state.campaign.threads);
  const referenceOptions = useSessionNotesStore((state) => state.referenceOptions);
  const npcs = useCampaign((state) => state.campaign.npcs);
  const locations = useCampaign((state) => state.campaign.locations);
  const factions = useCampaign((state) => state.campaign.factions);
  const [kind, setKind] = useState<SessionRecordLink["kind"]>("npc");
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const fieldId = useId();
  const records = { npc: npcs, location: locations, faction: factions, thread: (threads ?? []).map((thread) => ({ id: thread.id, name: thread.title })), puzzle: referenceOptions.puzzle };
  const options = records[kind].filter((record) => !links.some((link) => link.kind === kind && link.targetId === record.id));
  const open = (link: SessionRecordLink) => {
    if (link.kind === "npc") appCommands.openCharacter(link.targetId);
    if (link.kind === "location") appCommands.openLocation(link.targetId);
    if (link.kind === "thread") appCommands.openThread(link.targetId);
    if (link.kind === "faction") appCommands.openFaction(link.targetId);
  };
  return <Card><CardHeader><CardTitle variant="dossier">Related records</CardTitle><CardDescription>Relevant to this session; linking does not mark an encounter or visit.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-5">
    {(Object.keys(recordKinds) as SessionRecordLink["kind"][]).map((recordKind) => {
      const group = links.filter((link) => link.kind === recordKind);
      if (!editable && !group.length) return null;
      return <section key={recordKind} className="flex flex-col gap-2"><h3 className="text-sm font-semibold">{recordKinds[recordKind]}</h3>
        {!group.length && <p className="text-xs text-muted-foreground">None linked.</p>}
        <ul className="flex flex-col gap-2">{group.map((link) => {
          const target = records[recordKind].find((record) => record.id === link.targetId);
          const sample = recordKind === "puzzle";
          return <li key={link.targetId} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2"><div className="flex min-w-0 items-center gap-1">
            {sample ? <span className="min-w-0 flex-1 break-words text-sm">{target?.name ?? "Unavailable record"} <Badge variant="outline">Sample</Badge></span>
              : <Button variant="link" size="sm" disabled={!target} className="min-w-0 flex-1 justify-start" onClick={() => open(link)}><span className="truncate">{target?.name ?? "Unavailable record"}</span></Button>}
            {editable && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${target?.name ?? "record"}`} onClick={() => onChange(links.filter((item) => item !== link))}><Trash2Icon /></Button>}
          </div>{editable ? <Input aria-label={`Association with ${target?.name ?? "record"}`} value={link.label} placeholder="Association note (optional)" onChange={(event) => onChange(links.map((item) => item === link ? { ...item, label: event.currentTarget.value } : item))} />
            : link.label && <p className="break-words text-xs text-muted-foreground">{link.label}</p>}</li>;
        })}</ul>
      </section>;
    })}
    {!editable && !links.length && <Empty size="compact"><EmptyHeader><EmptyTitle>No related records</EmptyTitle><EmptyDescription>Use Edit to connect people, places, factions, threads, or puzzles.</EmptyDescription></EmptyHeader></Empty>}
    {editable && <FieldGroup>
      <Field><FieldLabel htmlFor={`${fieldId}-kind`}>Record type</FieldLabel><NativeSelect id={`${fieldId}-kind`} className="w-full" value={kind} onChange={(event) => { setKind(event.currentTarget.value as SessionRecordLink["kind"]); setTargetId(""); }}>
        {(Object.keys(recordKinds) as SessionRecordLink["kind"][]).map((recordKind) => <NativeSelectOption key={recordKind} value={recordKind}>{recordKinds[recordKind]}</NativeSelectOption>)}
      </NativeSelect></Field>
      {kind === "puzzle" && <p className="text-xs text-muted-foreground">{records[kind].length ? "Sample options until these record types are available." : "This record type is not available yet."}</p>}
      <Field><FieldLabel htmlFor={`${fieldId}-target`}>Choose record</FieldLabel><NativeSelect id={`${fieldId}-target`} className="w-full" value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)}><NativeSelectOption value="">Choose a record…</NativeSelectOption>{options.map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${fieldId}-label`}>Association note (optional)</FieldLabel><Input id={`${fieldId}-label`} value={label} placeholder="Why it matters this session…" onChange={(event) => setLabel(event.currentTarget.value)} /></Field>
      <Button variant="outline" disabled={!options.some((record) => record.id === targetId)} onClick={() => { onChange([...links, { kind, targetId, label: label.trim() }]); setTargetId(""); setLabel(""); }}><PlusIcon data-icon="inline-start" />Add to session</Button>
    </FieldGroup>}
  </div></CardContent></Card>;
}

function BeatCard({ beat, index, total, editable, sessionId, onChange, onMove, onRemove }: {
  beat: SessionBeat; index: number; total: number; editable: boolean; sessionId: string;
  onChange: (beat: SessionBeat) => void; onMove: (direction: number) => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fieldId = useId();
  return <Collapsible open={editable || expanded} onOpenChange={setExpanded} render={<Card />}><CardHeader><CardTitle><CollapsibleTrigger disabled={editable} render={<Button variant="ghost" className="h-auto max-w-full justify-start whitespace-normal text-left" />}>{index + 1}. {beat.title || "Untitled beat"}</CollapsibleTrigger></CardTitle>
    <CardAction><Badge variant="secondary">{beat.status === "happened" ? "Happened" : beat.status === "skipped" ? "Skipped" : "Planned"}</Badge></CardAction>
  </CardHeader><CollapsibleContent><CardContent><div className="flex flex-col gap-3">
    {editable && <FieldGroup><Field><FieldLabel htmlFor={`${fieldId}-title`}>Beat title</FieldLabel><Input id={`${fieldId}-title`} value={beat.title} onChange={(event) => onChange({ ...beat, title: event.currentTarget.value })} /></Field>
      <Field><FieldLabel htmlFor={`${fieldId}-status`}>Status</FieldLabel><NativeSelect id={`${fieldId}-status`} value={beat.status} onChange={(event) => onChange({ ...beat, status: event.currentTarget.value as SessionBeat["status"] })}><NativeSelectOption value="planned">Planned</NativeSelectOption><NativeSelectOption value="happened">Happened</NativeSelectOption><NativeSelectOption value="skipped">Skipped</NativeSelectOption></NativeSelect></Field>
    </FieldGroup>}
    <NotesField id={`${sessionId}:${beat.id}`} title="Beat notes" value={beat.notes} editable={editable} onChange={(notes) => onChange({ ...beat, notes })} />
    {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUpIcon data-icon="inline-start" />Move up</Button><Button variant="outline" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDownIcon data-icon="inline-start" />Move down</Button><Button variant="ghost" size="sm" onClick={onRemove}><Trash2Icon data-icon="inline-start" />Remove</Button></div>}
  </div></CardContent></CollapsibleContent></Collapsible>;
}

function SessionPage({ id, api }: { id: string; api: IDockviewPanelProps["api"] }) {
  const session = useSessionNotesStore((state) => state.sessions.find((item) => item.id === id));
  const draft = useSessionNotesStore((state) => state.drafts[id]);
  const capture = useSessionNotesStore((state) => state.captures[id] ?? "");
  const record = draft ?? session;
  const editing = !!draft;
  const [captured, setCaptured] = useState(false);
  const fieldId = useId();
  useEffect(() => { if (session) api.setTitle(`Session ${session.number} · ${session.title}`); }, [api, session]);
  if (!session || !record) return <Empty><EmptyHeader><EmptyTitle>Session unavailable</EmptyTitle><EmptyDescription>This prototype session is no longer in memory.</EmptyDescription></EmptyHeader><Button variant="outline" onClick={appCommands.openSessions}>All sessions</Button></Empty>;
  const update = (changes: Partial<SessionNote>) => {
    const state = useSessionNotesStore.getState();
    const current = state.drafts[id];
    if (current) state.setDraft(id, { ...current, ...changes });
  };
  const changeBeat = (beat: SessionBeat) => {
    const current = useSessionNotesStore.getState().drafts[id];
    if (current) update({ beats: current.beats.map((item) => item.id === beat.id ? beat : item) });
  };
  const moveBeat = (index: number, direction: number) => {
    const beats = [...record.beats];
    [beats[index], beats[index + direction]] = [beats[index + direction], beats[index]];
    update({ beats });
  };
  return <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 @lg/session:p-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 flex-col gap-2">
      <Button variant="ghost" size="sm" className="self-start" onClick={appCommands.openSessions}><ArrowLeftIcon data-icon="inline-start" />Sessions</Button>
      <h1 className="break-words font-serif text-3xl font-semibold">Session {record.number} — {record.title}</h1><p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarIcon aria-hidden="true" className="size-4" />{record.date || "No date set"}<Badge variant="outline">{record.previous ? "Previous" : "Upcoming"}</Badge></p>
    </div><div className="flex flex-wrap items-center gap-2">{editing ? <><span className="text-xs text-muted-foreground">{JSON.stringify(session) !== JSON.stringify(draft) ? "Unsaved changes" : "Editing"}</span><Button variant="outline" onClick={() => useSessionNotesStore.getState().discardDraft(id)}>Cancel</Button><Button disabled={!record.title.trim()} onClick={() => useSessionNotesStore.getState().saveDraft(id)}>Save changes</Button></> : <Button variant="outline" onClick={() => useSessionNotesStore.getState().setDraft(id, structuredClone(session))}><PencilIcon data-icon="inline-start" />Edit</Button>}</div></header>
    <p className="text-xs text-muted-foreground">Frontend prototype · Notes and drafts reset when you reload or switch campaigns.</p>
    {editing && <Card><CardHeader><CardTitle>Session details</CardTitle></CardHeader><CardContent><FieldGroup>
      <Field data-invalid={!record.title.trim() || undefined}><FieldLabel htmlFor={`${fieldId}-title`}>Title</FieldLabel><Input id={`${fieldId}-title`} aria-invalid={!record.title.trim() || undefined} aria-describedby={!record.title.trim() ? `${fieldId}-title-error` : undefined} value={record.title} onChange={(event) => update({ title: event.currentTarget.value })} />{!record.title.trim() && <FieldError id={`${fieldId}-title-error`}>Enter a session title.</FieldError>}</Field>
      <Field><FieldLabel htmlFor={`${fieldId}-number`}>Session number</FieldLabel><Input id={`${fieldId}-number`} type="number" min={1} value={record.number} onChange={(event) => { const number = Number(event.currentTarget.value); if (Number.isInteger(number) && number > 0) update({ number }); }} /></Field>
      <Field><FieldLabel htmlFor={`${fieldId}-date`}>Date (optional)</FieldLabel><Input id={`${fieldId}-date`} type="date" value={record.date} onChange={(event) => update({ date: event.currentTarget.value })} /></Field>
      <Field><FieldLabel htmlFor={`${fieldId}-group`}>Directory group</FieldLabel><NativeSelect id={`${fieldId}-group`} value={record.previous ? "previous" : "upcoming"} onChange={(event) => update({ previous: event.currentTarget.value === "previous" })}><NativeSelectOption value="upcoming">Upcoming</NativeSelectOption><NativeSelectOption value="previous">Previous</NativeSelectOption></NativeSelect></Field>
    </FieldGroup></CardContent></Card>}
    <div className="flex min-w-0 flex-col gap-5 @4xl/session:grid @4xl/session:grid-cols-3 @4xl/session:items-start">
      <div className="flex min-w-0 flex-col gap-4 @4xl/session:col-span-2">
        <NotesField id={`${id}:left-off`} title="Where we left off" value={record.whereLeftOff} editable={editing} onChange={(whereLeftOff) => update({ whereLeftOff })} />
        <NotesField id={`${id}:prep`} title="Prep notes" value={record.prep} editable={editing} onChange={(prep) => update({ prep })} />
        <section className="flex flex-col gap-3"><header className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold">Story beats<Badge variant="secondary">{record.beats.length}</Badge></h2>{editing && <Button variant="outline" size="sm" onClick={() => update({ beats: [...record.beats, { id: crypto.randomUUID(), title: "New story beat", notes: emptyNotes(), status: "planned" }] })}><PlusIcon data-icon="inline-start" />Add beat</Button>}</header>
          {!record.beats.length && <Empty size="compact"><EmptyHeader><EmptyTitle>No story beats yet</EmptyTitle><EmptyDescription>Use freeform prep, or add beats in Edit.</EmptyDescription></EmptyHeader></Empty>}
          {record.beats.map((beat, index) => <BeatCard key={beat.id} beat={beat} sessionId={id} index={index} total={record.beats.length} editable={editing} onChange={changeBeat} onMove={(direction) => moveBeat(index, direction)} onRemove={() => update({ beats: record.beats.filter((item) => item.id !== beat.id) })} />)}
        </section>
        <NotesField id={`${id}:happened`} title="What happened" value={record.happened} editable={editing} onChange={(happened) => update({ happened })} />
        {!editing && <Card><CardHeader><CardTitle>Quick capture</CardTitle><CardDescription>Append a private note to What happened without editing your prep.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3"><Field><FieldLabel htmlFor={`${fieldId}-capture`}>During-play note</FieldLabel><AutoSizeTextarea id={`${fieldId}-capture`} value={capture} placeholder="Decisions, surprises, consequences…" onChange={(event) => { setCaptured(false); useSessionNotesStore.getState().setCapture(id, event.currentTarget.value); }} /></Field><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground" role="status">{captured ? "Added to What happened." : "Draft stays here while you open other records."}</p><Button disabled={!capture.trim()} onClick={() => { useSessionNotesStore.getState().appendCapture(id); setCaptured(true); }}>Save note</Button></div></div></CardContent></Card>}
        <NotesField id={`${id}:summary`} title="Summary for Players" value={record.summary} editable={editing} publicSummary onChange={(summary) => update({ summary })} />
      </div>
      <SessionLinks key={editing ? "edit" : "read"} links={record.links} editable={editing} onChange={(links) => update({ links })} />
    </div>
  </div>;
}

export function SessionsPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.sessionId === "string" ? params.sessionId : null;
  const scrollRef = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScroll.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <article ref={scrollRef} className="@container/session h-full overflow-auto" onScroll={(event) => { api.updateParameters({ scrollTop: event.currentTarget.scrollTop }); window.dispatchEvent(new Event("campaign-workspace-change")); }}>
    {id ? <SessionPage key={id} id={id} api={api} /> : <SessionDirectory />}
  </article>;
}
