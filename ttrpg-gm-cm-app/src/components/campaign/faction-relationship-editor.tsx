import { useState } from "react";
import type { Faction, Npc } from "@/lib/campaign-data";
import { canParentNode, type FactionAlliance, type FactionNode } from "@/lib/faction-prototype";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { FactionSelect, FactionVisibility } from "./faction-fields";

export function FactionNodeEditor({ node, nodes, npcs, factions, onSave, onClose }: {
  node: FactionNode; nodes: FactionNode[]; npcs: Npc[]; factions: Faction[];
  onSave: (node: FactionNode) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(node);
  const candidates = draft.kind === "npc" ? npcs : factions;
  const available = candidates.filter((record) => !nodes.some((item) => item.id !== draft.id && item.kind === draft.kind && item.targetId === record.id));
  const valid = Boolean(draft.kind === "group" ? draft.name.trim() : available.some((record) => record.id === draft.targetId))
    && canParentNode(nodes, draft.id, draft.parentId);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPopup>
    <form className="flex flex-col gap-5 overflow-auto p-5" onSubmit={(event) => {
      event.preventDefault();
      if (valid) onSave({ ...draft, name: draft.name.trim(), role: draft.role.trim() });
    }}>
      <div className="flex flex-col gap-2"><DialogTitle>{nodes.some((item) => item.id === node.id) ? "Edit connection" : draft.kind === "npc" ? "Add member" : "Add subgroup"}</DialogTitle>
        <DialogDescription>Changes join this faction’s draft. Save the faction to keep them for this session.</DialogDescription></div>
      <FieldGroup>
        {draft.kind !== "npc" && <FactionSelect label="Subgroup source" value={draft.kind} onChange={(kind) => {
          if (kind === "group" || kind === "faction") setDraft({ ...draft, kind, targetId: "", name: "" });
        }}><NativeSelectOption value="group">Named subgroup</NativeSelectOption><NativeSelectOption value="faction">Existing faction</NativeSelectOption></FactionSelect>}
        {draft.kind === "group" ? <Field><FieldLabel htmlFor="faction-group-name">Subgroup name</FieldLabel>
          <Input id="faction-group-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} placeholder="Harbor operations" required /></Field>
          : <FactionSelect label={draft.kind === "npc" ? "NPC" : "Faction"} value={draft.targetId} onChange={(targetId) => {
            setDraft({ ...draft, targetId, name: candidates.find((record) => record.id === targetId)?.name ?? "" });
          }}><NativeSelectOption value="">Choose a record…</NativeSelectOption>{available.map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}</FactionSelect>}
        <Field><FieldLabel htmlFor="faction-node-role">{draft.kind === "npc" ? "Role or rank" : "Purpose"}</FieldLabel>
          <Input id="faction-node-role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.currentTarget.value })} placeholder={draft.kind === "npc" ? "Leader, Member, Quartermaster…" : "Shipping, Research…"} /></Field>
        <FactionSelect label="Connection" value={draft.relation} onChange={(relation) => {
          if (relation === "part-of" || relation === "reports-to") setDraft({ ...draft, relation });
        }}><NativeSelectOption value="part-of">Part of</NativeSelectOption><NativeSelectOption value="reports-to">Reports to</NativeSelectOption></FactionSelect>
        <FactionSelect label="Connect beneath" value={draft.parentId} onChange={(parentId) => setDraft({ ...draft, parentId })}>
          <NativeSelectOption value="root">This faction</NativeSelectOption>
          {nodes.filter((item) => canParentNode(nodes, draft.id, item.id)).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.kind === "npc" ? "NPC" : "Subgroup"}</NativeSelectOption>)}
        </FactionSelect>
        <FactionVisibility revealed={draft.revealed} onChange={(revealed) => setDraft({ ...draft, revealed })} />
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid}>Apply to draft</Button></div>
    </form>
  </DialogPopup></Dialog>;
}

export function FactionAllianceEditor({ alliance, alliances, factions, onSave, onClose }: {
  alliance: FactionAlliance; alliances: FactionAlliance[]; factions: Faction[];
  onSave: (value: FactionAlliance) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(alliance);
  const available = factions.filter((record) => !alliances.some((item) => item.targetId !== alliance.targetId && item.targetId === record.id));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPopup>
    <form className="flex flex-col gap-5 overflow-auto p-5" onSubmit={(event) => {
      event.preventDefault();
      if (available.some((record) => record.id === draft.targetId)) onSave({ ...draft, label: draft.label.trim() || "Associated" });
    }}>
      <div className="flex flex-col gap-2"><DialogTitle>Faction relationship</DialogTitle><DialogDescription>Describe this faction’s connection to another organization.</DialogDescription></div>
      <FieldGroup>
        <FactionSelect label="Faction" value={draft.targetId} onChange={(targetId) => setDraft({ ...draft, targetId })}>
          <NativeSelectOption value="">Choose a faction…</NativeSelectOption>{available.map((record) => <NativeSelectOption key={record.id} value={record.id}>{record.name}</NativeSelectOption>)}
        </FactionSelect>
        <Field><FieldLabel htmlFor="faction-alliance-label">Relationship</FieldLabel><Input id="faction-alliance-label" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.currentTarget.value })} placeholder="Ally, Rival, Trading partner…" /></Field>
        <FactionVisibility revealed={draft.revealed} onChange={(revealed) => setDraft({ ...draft, revealed })} />
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!available.some((record) => record.id === draft.targetId)}>Apply to draft</Button></div>
    </form>
  </DialogPopup></Dialog>;
}
