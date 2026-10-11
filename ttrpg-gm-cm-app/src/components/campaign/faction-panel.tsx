import { useEffect, useMemo, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, LockIcon, PencilIcon, PlusIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { saveFaction, useCampaign } from "@/lib/campaign-data";
import { appCommands } from "@/lib/app-commands";
import { cn } from "@/lib/utils";
import { initialFactionPrototype, publicFactionNodes, removeFactionNode, type FactionAlliance, type FactionNode } from "@/lib/faction-prototype";
import { useFactionPrototypeStore } from "@/stores/faction-prototype-store";
import { FactionEmpty, FactionSection, FactionSelect } from "./faction-fields";
import { FactionStructure, openFactionNode } from "./faction-structure";
import { FactionAllianceEditor, FactionNodeEditor } from "./faction-relationship-editor";

export function FactionPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.factionId === "string" ? params.factionId : "";
  const faction = useCampaign((state) => state.campaign.factions?.find((item) => item.id === id));
  const npcs = useCampaign((state) => state.campaign.npcs);
  const factions = useCampaign((state) => state.campaign.factions);
  const locations = useCampaign((state) => state.campaign.locations);
  const storedPrototype = useFactionPrototypeStore((state) => state.records[id]);
  const records = useFactionPrototypeStore((state) => state.records);
  const savedPrototype = useMemo(() => storedPrototype ?? initialFactionPrototype(id, npcs), [storedPrototype, id, npcs]);
  const [draft, setDraft] = useState(faction);
  const [prototype, setPrototype] = useState(savedPrototype);
  const [editing, setEditing] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [nodeEditor, setNodeEditor] = useState<FactionNode | null>(null);
  const [allianceEditor, setAllianceEditor] = useState<FactionAlliance | null>(null);
  const [isWide, setIsWide] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const initialScroll = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => {
    setDraft(faction ? structuredClone(faction) : undefined);
    setPrototype(structuredClone(savedPrototype));
    setEditing(false);
    setNodeEditor(null);
    setAllianceEditor(null);
    if (faction) api.setTitle(faction.name);
  }, [faction, savedPrototype, api]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setIsWide(element.clientWidth >= 900);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const frame = requestAnimationFrame(() => { element.scrollTop = initialScroll.current; });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  if (!faction || !draft) return <article className="h-full overflow-auto p-8">This faction is no longer available.</article>;
  const changed = JSON.stringify(draft) !== JSON.stringify(faction) || JSON.stringify(prototype) !== JSON.stringify(savedPrototype);
  const otherFactions = factions.filter((record) => record.id !== id);
  const tags = [...new Set(prototype.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
  const headquarters = locations.find((record) => record.id === prototype.headquartersId);
  const parentFaction = factions.find((record) => record.id === prototype.parentFactionId);
  const nodes = prototype.nodes.map((node) => ({ ...node, name: node.kind === "npc" ? npcs.find((record) => record.id === node.targetId)?.name ?? "Unavailable NPC"
    : node.kind === "faction" ? factions.find((record) => record.id === node.targetId)?.name ?? "Unavailable faction" : node.name }));
  const availableNodes = nodes.filter((node) => node.kind === "group" || (node.kind === "npc" ? npcs : factions).some((record) => record.id === node.targetId));
  const publicNodes = publicFactionNodes(availableNodes);
  const members = nodes.filter((node) => node.kind === "npc");
  const subgroups = nodes.filter((node) => node.kind !== "npc");
  const publicAlliances = prototype.alliances.filter((link) => link.revealed && factions.some((record) => record.id === link.targetId));
  const canParentFaction = (parentId: string) => {
    const visited = new Set([id]);
    let current = parentId;
    while (current) {
      if (visited.has(current)) return false;
      visited.add(current);
      current = records[current]?.parentFactionId ?? "";
    }
    return true;
  };
  const cancel = () => {
    setDraft(structuredClone(faction)); setPrototype(structuredClone(savedPrototype));
    setEditing(false); setNodeEditor(null); setAllianceEditor(null);
  };
  const addNode = (kind: "npc" | "group") => setNodeEditor({ id: crypto.randomUUID(), kind, targetId: "", name: "", role: kind === "npc" ? "Member" : "",
    parentId: "root", relation: "part-of", revealed: false });
  const save = () => {
    if (!draft.name.trim() || !canParentFaction(prototype.parentFactionId)) return;
    useFactionPrototypeStore.getState().save(id, prototype);
    if (JSON.stringify(draft) !== JSON.stringify(faction)) {
      saveFaction(id, { name: draft.name, image: draft.image, description: draft.description, gmNotes: draft.gmNotes });
    }
    setEditing(false);
  };
  const sample = () => {
    const groupId = crypto.randomUUID();
    const demoNodes: FactionNode[] = [{ id: groupId, kind: "group", name: "Harbor operations", targetId: "", role: "Local branch", parentId: "root", relation: "part-of", revealed: true }];
    npcs.slice(0, 2).forEach((npc, index) => demoNodes.push({ id: `npc:${npc.id}`, kind: "npc", targetId: npc.id, name: npc.name,
      role: index === 0 ? "Leader" : "Member", parentId: index === 0 ? groupId : `npc:${npcs[0].id}`, relation: index === 0 ? "part-of" : "reports-to", revealed: index === 0 }));
    setPrototype({ ...prototype, banner: prototype.banner ?? draft.image?.url ?? null, factionType: prototype.factionType || "Guild", known: true,
      nodes: demoNodes, alliances: otherFactions.length ? [{ targetId: otherFactions[0].id, label: "Trading partner", revealed: false }] : [] });
    setStructureOpen(true);
  };
  const relationshipList = (items: FactionNode[]) => <ul className="flex flex-col gap-2">{items.map((node) => {
    const npc = npcs.find((record) => record.id === node.targetId);
    const available = node.kind === "group" || availableNodes.some((item) => item.id === node.id);
    return <li key={node.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      {node.kind === "npc" && (npc?.presentation.portrait ? <img src={npc.presentation.portrait.url} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        : <UserIcon aria-hidden="true" className="size-8 shrink-0 text-muted-foreground" />)}
      <div className="min-w-0 flex-1">{node.kind === "group" ? <p className="break-words font-medium">{node.name}</p>
        : <Button variant="link" size="inline" className="max-w-full justify-start" disabled={!available} onClick={() => openFactionNode(node)}><span className="truncate">{node.name}</span></Button>}
        <p className="text-xs text-muted-foreground">{node.role || "Subgroup"}</p></div>
      <Badge variant={node.revealed ? "public" : "outline"}>{node.revealed ? "Revealed" : "Hidden"}</Badge>
      {editing && <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setNodeEditor(node)}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={() => setPrototype({ ...prototype, nodes: removeFactionNode(prototype.nodes, node.id) })}>Remove</Button></div>}
    </li>;
  })}</ul>;

  const narrative = <div className="flex min-w-0 flex-col gap-4">
    {(editing || prototype.banner) && (editing ? <NpcImageField label="Scenic banner (GM view)" editable value={prototype.banner} aspectRatio="4 / 1" onChange={(banner) => setPrototype((current) => ({ ...current, banner }))} />
      : <img src={prototype.banner!} alt={`${draft.name} scenery`} className="aspect-[4/1] w-full rounded-xl object-cover" />)}
    <FactionSection title="Description for Players" action={<Badge variant="public">Public</Badge>}>
      <div className="@container min-w-0">
        <div className="flex min-w-0 flex-col gap-4 @min-[420px]:flex-row">
        {(editing || draft.image) && <div className="min-w-0 @min-[420px]:w-2/5 @min-[420px]:shrink-0">{editing ? <NpcImageField label="Faction symbol or public image" editable value={draft.image?.url ?? null} aspectRatio="1 / 1" fit="contain"
          onChange={(url) => setDraft((current) => current ? { ...current, image: url ? { type: "img", url } : null } : current)} />
          : <img src={draft.image!.url} alt={`${draft.name} symbol or public image`} className="aspect-square w-full max-w-48 rounded-lg object-contain" />}</div>}
        <div className="min-w-0 flex-1">{editing ? <Field><FieldLabel htmlFor={`${id}-description`}>Description for Players</FieldLabel>
          <AutoSizeTextarea id={`${id}-description`} value={draft.description} placeholder="What the party knows about this faction…" onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })} /></Field>
          : <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.description || "No player description yet."}</p>}</div>
        </div>
      </div>
    </FactionSection>
    <FactionSection title="GM Notes" action={<Badge variant="outline"><LockIcon data-icon="inline-start" />GM only</Badge>}>
      {editing ? <Field><FieldLabel className="sr-only" htmlFor={`${id}-notes`}>GM notes</FieldLabel><AutoSizeTextarea id={`${id}-notes`} value={draft.gmNotes}
        placeholder="Secrets, motives, and session reminders…" onChange={(event) => setDraft({ ...draft, gmNotes: event.currentTarget.value })} /></Field>
        : <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.gmNotes || "No GM notes yet."}</p>}
    </FactionSection>
  </div>;
  const reference = <div className="flex min-w-0 flex-col gap-4">
    <FactionSection title="At a glance">
      {editing ? <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel><Input id={`${id}-type`} value={prototype.factionType} placeholder="Guild, Trading company, Cult…" onChange={(event) => setPrototype({ ...prototype, factionType: event.currentTarget.value })} /></Field>
        <FactionSelect label="Headquarters" value={prototype.headquartersId} onChange={(headquartersId) => setPrototype({ ...prototype, headquartersId })}>
          <NativeSelectOption value="">Unspecified</NativeSelectOption>{locations.map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}
        </FactionSelect>
        <FactionSelect label="Parent faction" value={prototype.parentFactionId} onChange={(parentFactionId) => setPrototype({ ...prototype, parentFactionId })}>
          <NativeSelectOption value="">Independent faction</NativeSelectOption>{otherFactions.filter((record) => canParentFaction(record.id)).map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}
        </FactionSelect>
        <Field><FieldLabel htmlFor={`${id}-tags`}>Tags</FieldLabel><Input id={`${id}-tags`} value={prototype.tags} placeholder="Trade, Maritime, Politics" onChange={(event) => setPrototype({ ...prototype, tags: event.currentTarget.value })} /></Field>
      </FieldGroup> : <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Type</dt><dd>{prototype.factionType || "Unspecified"}</dd>
        <dt className="text-muted-foreground">Headquarters</dt><dd>{headquarters ? <Button variant="link" size="inline" className="max-w-full" onClick={() => appCommands.openLocation(headquarters.id)}><span className="truncate">{headquarters.name}</span></Button> : "Unspecified"}</dd>
        <dt className="text-muted-foreground">Parent faction</dt><dd>{parentFaction ? <Button variant="link" size="inline" className="max-w-full" onClick={() => appCommands.openFaction(parentFaction.id)}><span className="truncate">{parentFaction.name}</span></Button> : "Independent"}</dd>
        <dt className="text-muted-foreground">Tags</dt><dd className="flex flex-wrap gap-1">{tags.length ? tags.map((tag) => <Badge variant="secondary" key={tag}>{tag}</Badge>) : "None"}</dd>
      </dl>}
    </FactionSection>
    <FactionSection title="Player presentation" description="Preview this faction’s public information.">
      {editing ? <FactionSelect label="Known to players" value={prototype.known ? "known" : "unknown"} onChange={(value) => setPrototype({ ...prototype, known: value === "known" })}>
        <NativeSelectOption value="unknown">Unknown to players</NativeSelectOption><NativeSelectOption value="known">Known to players</NativeSelectOption>
      </FactionSelect> : <Badge variant={prototype.known ? "public" : "outline"}>{prototype.known ? "Known to players" : "Unknown to players"}</Badge>}
      <p className="text-xs text-muted-foreground">Each connection is revealed separately. GM notes and the scenic banner stay private.</p>
      <Button variant="outline" onClick={() => setPreviewOpen(true)}><EyeIcon data-icon="inline-start" />Preview public view</Button>
    </FactionSection>
    <FactionSection title="Members & roles" action={editing && <Button variant="outline" size="sm" onClick={() => addNode("npc")}><PlusIcon data-icon="inline-start" />Add member</Button>}>
      {members.length ? relationshipList(members) : <FactionEmpty title="No members linked">In Edit, choose an NPC and give them a role.</FactionEmpty>}
    </FactionSection>
    <FactionSection title="Allies & rivals" action={editing && <Button variant="outline" size="sm" onClick={() => setAllianceEditor({ targetId: "", label: "", revealed: false })}><PlusIcon data-icon="inline-start" />Add relationship</Button>}>
      {prototype.alliances.length ? <ul className="flex flex-col gap-2">{prototype.alliances.map((link) => {
        const target = factions.find((record) => record.id === link.targetId);
        return <li key={link.targetId} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <div className="min-w-0 flex-1"><Button variant="link" size="inline" disabled={!target} className="max-w-full" onClick={() => appCommands.openFaction(link.targetId)}><span className="truncate">{target?.name ?? "Unavailable faction"}</span></Button><p className="text-xs text-muted-foreground">{link.label}</p></div>
          <Badge variant={link.revealed ? "public" : "outline"}>{link.revealed ? "Revealed" : "Hidden"}</Badge>
          {editing && <><Button variant="ghost" size="sm" onClick={() => setAllianceEditor(link)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => setPrototype({ ...prototype, alliances: prototype.alliances.filter((item) => item.targetId !== link.targetId) })}>Remove</Button></>}
        </li>;
      })}</ul> : <FactionEmpty title="No faction relationships">Link allies, rivals, and other organizations here.</FactionEmpty>}
    </FactionSection>
  </div>;

  return <article ref={scrollRef} className="h-full overflow-auto p-6 sm:p-8" onScroll={(event) => {
    api.updateParameters({ scrollTop: event.currentTarget.scrollTop }); window.dispatchEvent(new Event("campaign-workspace-change"));
  }}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">{editing ? <Field><FieldLabel htmlFor={`${id}-name`}>Faction name</FieldLabel><Input id={`${id}-name`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></Field>
        : <><h1 className="break-words font-serif text-3xl font-semibold">{draft.name}</h1><p className="mt-1 text-sm text-muted-foreground">{prototype.factionType || "Faction"}</p></>}</div>
      <div className="flex flex-wrap items-center gap-2">{editing ? <>{changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}<Button variant="outline" onClick={cancel}>Cancel</Button><Button disabled={!changed || !draft.name.trim() || !canParentFaction(prototype.parentFactionId)} onClick={save}>Save changes</Button></>
        : <Button variant="outline" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" />Edit</Button>}</div>
    </header>
    <p className="mb-5 text-xs text-muted-foreground">Frontend prototype · New details, relationships, and visibility reset when you reload or switch campaigns. Name, public image, description, and GM notes save normally.</p>
    <div className={cn("gap-4", isWide ? "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start" : "flex flex-col")}>{narrative}{reference}</div>
    <div className="mt-4"><FactionSection title="Structure" description="Subgroups are part of an organization. Reporting connections show who answers to whom."
      action={<Button variant="outline" size="sm" aria-expanded={structureOpen} aria-controls={`${id}-structure`} onClick={() => setStructureOpen(!structureOpen)}>{structureOpen ? <ChevronUpIcon data-icon="inline-start" /> : <ChevronDownIcon data-icon="inline-start" />}{structureOpen ? "Collapse" : "Expand"}</Button>}>
      {structureOpen && <div id={`${id}-structure`} className="flex flex-col gap-4">
        {editing && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => addNode("group")}><PlusIcon data-icon="inline-start" />Add subgroup</Button>
          <Button variant="outline" size="sm" onClick={() => addNode("npc")}><PlusIcon data-icon="inline-start" />Add member</Button>
          {!prototype.nodes.length && !prototype.alliances.length && <Button variant="ghost" size="sm" onClick={sample}>Try sample structure</Button>}</div>}
        <FactionStructure name={draft.name} nodes={nodes} onEdit={editing ? setNodeEditor : undefined} />
        {editing && subgroups.length > 0 && <div className="flex flex-col gap-2"><p className="text-sm font-medium">Subgroups</p>{relationshipList(subgroups)}</div>}
      </div>}
      {!structureOpen && <p className="text-sm text-muted-foreground">{members.length} members · {subgroups.length} subgroups</p>}
    </FactionSection></div>
    {nodeEditor && <FactionNodeEditor node={nodeEditor} nodes={nodes} npcs={npcs} factions={otherFactions} onClose={() => setNodeEditor(null)} onSave={(node) => {
      setPrototype({ ...prototype, nodes: [...prototype.nodes.filter((item) => item.id !== node.id), node] }); setNodeEditor(null);
    }} />}
    {allianceEditor && <FactionAllianceEditor alliance={allianceEditor} alliances={prototype.alliances} factions={otherFactions} onClose={() => setAllianceEditor(null)} onSave={(link) => {
      setPrototype({ ...prototype, alliances: [...prototype.alliances.filter((item) => item.targetId !== allianceEditor.targetId), link] }); setAllianceEditor(null);
    }} />}
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogPopup className="w-[min(56rem,calc(100vw-2rem))]">
      <div className="flex flex-col gap-5 overflow-auto p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-col gap-2"><DialogTitle>Public preview</DialogTitle><DialogDescription>{editing ? "Previewing your current draft." : "Previewing this session’s saved faction."} This does not publish to the player window.</DialogDescription></div><Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Close</Button></div>
        {!prototype.known ? <FactionEmpty title="This faction is unknown">Players would not see this faction in their directory.</FactionEmpty> : <>
          <div className="flex flex-col gap-3">{draft.image && <img src={draft.image.url} alt={`${draft.name} public image`} className="max-h-52 w-full rounded-lg object-contain" />}<h2 className="font-serif text-2xl font-semibold">{draft.name}</h2><p className="whitespace-pre-wrap text-sm leading-6">{draft.description || "No public description yet."}</p></div>
          <FactionSection title="Known members">{publicNodes.filter((node) => node.kind === "npc").length ? <ul className="flex flex-col gap-2">{publicNodes.filter((node) => node.kind === "npc").map((node) => <li key={node.id} className="flex items-center gap-3">{npcs.find((npc) => npc.id === node.targetId)?.presentation.portrait && <img src={npcs.find((npc) => npc.id === node.targetId)!.presentation.portrait!.url} alt="" className="size-10 rounded-lg object-cover" />}<span>{node.name}</span><Badge variant="secondary">{node.role || "Member"}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No members revealed.</p>}</FactionSection>
          <FactionSection title="Known relationships">{publicAlliances.length ? <ul className="flex flex-col gap-2">{publicAlliances.map((link) => <li key={link.targetId} className="flex flex-wrap gap-2"><span>{factions.find((record) => record.id === link.targetId)?.name}</span><Badge variant="secondary">{link.label}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No relationships revealed.</p>}</FactionSection>
          <FactionSection title="Known structure"><FactionStructure name={draft.name} nodes={publicNodes} interactive={false} /></FactionSection>
        </>}
      </div>
    </DialogPopup></Dialog>
  </article>;
}
