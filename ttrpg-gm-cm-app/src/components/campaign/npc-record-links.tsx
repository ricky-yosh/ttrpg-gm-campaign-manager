import { useId, useState } from "react";
import { ArrowRightIcon, HeartIcon, FlagIcon, MapPinIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { appCommands } from "@/lib/app-commands";
import type { NpcRelationship } from "@/lib/campaign-data";

const linkKinds = {
  npc: {
    heading: "Relationships", targetType: "NPC", addLabel: "relationship", fieldLabel: "Relationship",
    description: "People connected to this NPC", placeholder: "For example, Close friend",
    icon: HeartIcon, open: appCommands.openCharacter,
  },
  location: {
    heading: "Locations", targetType: "location", addLabel: "location", fieldLabel: "Association",
    description: "Places associated with this NPC", placeholder: "For example, Childhood home",
    icon: MapPinIcon, open: appCommands.openLocation,
  },
  faction: {
    heading: "Factions", targetType: "faction", addLabel: "faction", fieldLabel: "Affiliation",
    description: "Groups associated with this NPC", placeholder: "For example, Member, Friendly, or Enemy",
    icon: FlagIcon, open: appCommands.openFaction,
  },
};

type NpcRecordLinksProps = {
  sourceNpcId: string;
  records: { id: string; name: string }[];
  kind?: keyof typeof linkKinds;
  value: NpcRelationship[];
  editable: boolean;
  onChange: (links: NpcRelationship[]) => void;
};

export function NpcRecordLinks({ sourceNpcId, records, value, editable, onChange, kind = "npc" }: NpcRecordLinksProps) {
  const id = useId();
  const config = linkKinds[kind];
  const { heading, targetType, placeholder: labelPlaceholder, fieldLabel: linkLabel, icon: Icon } = config;
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const available = records.filter((npc) => (kind !== "npc" || npc.id !== sourceNpcId) && !value.some((link) => link.targetId === npc.id));

  const addLink = () => {
    if (!available.some((npc) => npc.id === targetId)) return;
    onChange([...value, { targetId, label: label.trim() }]);
    setTargetId("");
    setLabel("");
    setAdding(false);
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 font-semibold">
          <Icon aria-hidden="true" className="size-4 text-primary" /> {heading}
        </h2>
        {editable && (
          <Button type="button" variant="outline" size="sm" disabled={!available.length} onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" /> Add {config.addLabel}
          </Button>
        )}
      </header>
      <p className="text-xs text-muted-foreground">{config.description}</p>
      {!value.length && <p className="text-sm text-muted-foreground">No {heading.toLowerCase()} added yet.</p>}
      <ul className="flex flex-col gap-2">
        {value.map((link) => {
          const target = records.find((npc) => npc.id === link.targetId);
          return (
            <li key={link.targetId} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="min-w-0 flex-1 justify-start"
                  disabled={!target}
                  onClick={() => config.open(link.targetId)}
                  aria-label={target ? `Open ${target.name}${link.label ? `: ${link.label}` : ""}` : `Unavailable ${targetType}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="w-full truncate text-left">{target?.name ?? `Unavailable ${targetType}`}</span>
                    {link.label && <span className="w-full truncate text-left text-xs text-muted-foreground">{link.label}</span>}
                  </span>
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
                {editable && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove relationship to ${target?.name ?? `unavailable ${targetType}`}`} onClick={() => onChange(value.filter((item) => item.targetId !== link.targetId))}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              {editable && (
                <Input
                  aria-label={`${linkLabel} with ${target?.name ?? `unavailable ${targetType}`}`}
                  value={link.label}
                  placeholder={labelPlaceholder}
                  onChange={(event) => onChange(value.map((item) => item.targetId === link.targetId ? { ...item, label: event.currentTarget.value } : item))}
                />
              )}
            </li>
          );
        })}
      </ul>
      {editable && adding && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-target`}>{targetType === "NPC" ? "NPC" : targetType === "location" ? "Location" : "Faction"}</FieldLabel>
            <select id={`${id}-target`} value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="">Choose {targetType === "NPC" ? "an NPC" : `a ${targetType}`}</option>
              {available.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-label`}>{linkLabel}</FieldLabel>
            <Input id={`${id}-label`} value={label} placeholder={labelPlaceholder} onChange={(event) => setLabel(event.currentTarget.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!available.some((npc) => npc.id === targetId)} onClick={addLink}>Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setTargetId(""); setLabel(""); }}>Cancel</Button>
          </div>
        </FieldGroup>
      )}
    </section>
  );
}
