import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import type { NpcReference } from "@/lib/campaign-data";

const referenceGroups: { title: string; fields: { key: keyof NpcReference; label: string }[] }[] = [
  { title: "Background", fields: [{ key: "background", label: "" }] },
  { title: "Characteristics", fields: [
    { key: "wants", label: "Wants" }, { key: "ideals", label: "Ideals" }, { key: "bond", label: "Bond" },
    { key: "flaw", label: "Flaw" }, { key: "secrets", label: "Secrets" }, { key: "reaction", label: "Reaction" },
  ] },
  { title: "Roleplaying", fields: [
    { key: "personality", label: "Personality" }, { key: "mannerisms", label: "Mannerisms" },
    { key: "notableActions", label: "Notable actions" }, { key: "voice", label: "Voice" },
  ] },
  { title: "Relationships", fields: [
    { key: "allies", label: "Allies" }, { key: "enemies", label: "Enemies" }, { key: "other", label: "Other" },
  ] },
];

type NpcGmReferenceProps = {
  value: NpcReference;
  editable: boolean;
  onChange: (key: keyof NpcReference, value: string) => void;
};

export function NpcGmReference({ value: reference, editable, onChange }: NpcGmReferenceProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">GM Reference</h2>
      {referenceGroups.map((group) => {
        const fields = group.fields.filter(({ key }) => editable || reference[key].trim());
        if (!fields.length) return null;
        return (
          <section key={group.title} className="border-t pt-3 first:border-0 first:pt-0">
            <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
            <div className="space-y-2.5">
              {fields.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
                  {editable ? (
                    <AutoSizeTextarea
                      aria-label={label}
                      value={reference[key]}
                      onChange={(event) => onChange(key, event.currentTarget.value)}
                      placeholder={`Add ${label.toLowerCase()}…`}
                    />
                  ) : <p className="whitespace-pre-wrap text-sm leading-6">{reference[key]}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
