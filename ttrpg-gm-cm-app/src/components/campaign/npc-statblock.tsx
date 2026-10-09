import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlusIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import type { Dnd55eAbilityScores, Dnd55eFeature, Dnd55eFeatureGroup, Dnd55eStatblock } from "@/lib/statblock-types";
import { blobToDataUrl, convertImageToWebp, IMAGE_ACCEPT } from "@/lib/image-utils";

export type NpcStatblockProps = {
  value: Dnd55eStatblock;
  editable: boolean;
  onChange: (value: Dnd55eStatblock) => void;
  tokenImage: string | null;
  onTokenImageChange: (image: string | null) => void;
  fallbackName?: string;
  className?: string;
};

const ABILITIES: { key: keyof Dnd55eAbilityScores; label: string }[] = [
  { key: "strength", label: "STR" },
  { key: "dexterity", label: "DEX" },
  { key: "constitution", label: "CON" },
  { key: "intelligence", label: "INT" },
  { key: "wisdom", label: "WIS" },
  { key: "charisma", label: "CHA" },
];

const FEATURE_GROUPS: { key: Dnd55eFeatureGroup; label: string }[] = [
  { key: "traits", label: "Traits" },
  { key: "actions", label: "Actions" },
  { key: "bonusActions", label: "Bonus Actions" },
  { key: "reactions", label: "Reactions" },
  { key: "legendaryActions", label: "Legendary Actions" },
];

const TEXT_FIELDS: { key: keyof Dnd55eStatblock; label: string; placeholder: string }[] = [
  { key: "sizeAndType", label: "Size and type", placeholder: "Medium humanoid (elf)" },
  { key: "alignment", label: "Alignment", placeholder: "Neutral good" },
  { key: "armorClass", label: "Armor Class", placeholder: "15 (leather armor)" },
  { key: "hitPoints", label: "Hit Points", placeholder: "58 (9d8 + 18)" },
  { key: "speed", label: "Speed", placeholder: "30 ft." },
  { key: "savingThrows", label: "Saving Throws", placeholder: "Dex +7, Wis +5" },
  { key: "skills", label: "Skills", placeholder: "Acrobatics +7, Perception +5" },
  { key: "damageVulnerabilities", label: "Damage Vulnerabilities", placeholder: "—" },
  { key: "damageResistances", label: "Damage Resistances", placeholder: "Fire" },
  { key: "damageImmunities", label: "Damage Immunities", placeholder: "Poison" },
  { key: "conditionImmunities", label: "Condition Immunities", placeholder: "Charmed" },
  { key: "senses", label: "Senses", placeholder: "Passive Perception 15" },
  { key: "languages", label: "Languages", placeholder: "Common, Elvish" },
  { key: "challenge", label: "Challenge", placeholder: "6 (2,300 XP)" },
];

function fieldText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function Dnd55eStatblock({
  value,
  editable,
  onChange,
  tokenImage,
  onTokenImageChange,
  fallbackName,
  className,
}: NpcStatblockProps) {
  const headingId = useId();
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  const [imagePending, setImagePending] = useState(false);
  useEffect(() => {
    if (!editable) setImagePending(false);
    return () => { uploadVersion.current++; };
  }, [editable]);
  const [imageError, setImageError] = useState("");
  const hasAnyValue = Object.values(value).some((item) =>
    typeof item === "string" ? Boolean(item.trim()) : item && Object.values(item).some(Boolean),
  );

  const update = (key: keyof Dnd55eStatblock, next: string) => {
    onChange({ ...value, [key]: next });
  };

  const updateAbility = (key: keyof Dnd55eAbilityScores, next: string) => {
    onChange({ ...value, abilityScores: { ...value.abilityScores, [key]: next } });
  };

  const updateFeatures = (group: Dnd55eFeatureGroup, features: Dnd55eFeature[]) => {
    onChange({ ...value, features: { ...value.features, [group]: features } });
  };

  const handleTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    const version = ++uploadVersion.current;
    setImagePending(true);
    setImageError("");
    void convertImageToWebp(file)
      .then(blobToDataUrl)
      .then((dataUrl) => {
        if (version === uploadVersion.current) onTokenImageChange(dataUrl);
      })
      .catch((conversionError: unknown) => {
        if (version !== uploadVersion.current) return;
        setImageError(conversionError instanceof Error ? conversionError.message : "The selected image could not be converted.");
      })
      .finally(() => { if (version === uploadVersion.current) setImagePending(false); });
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("min-w-0 rounded-xl border bg-card text-card-foreground", className)}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {editable ? (
              <Input
                id={headingId}
                value={value.name ?? ""}
                onChange={(event) => update("name", event.currentTarget.value)}
                placeholder="NPC name"
              />
            ) : (
              <h2 id={headingId} className="font-serif text-xl font-semibold">
                {value.name || fallbackName || "Statblock"}
              </h2>
            )}
            {editable ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["sizeAndType", "alignment"] as const).map((key) => (
                  <Input
                    key={key}
                    aria-label={key === "sizeAndType" ? "Size and type" : "Alignment"}
                    value={value[key] ?? ""}
                    onChange={(event) => update(key, event.currentTarget.value)}
                    placeholder={key === "sizeAndType" ? "Medium humanoid" : "Alignment"}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm italic text-muted-foreground">
                {[value.sizeAndType, value.alignment].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="w-20 shrink-0 space-y-1.5 text-center">
            <div className="relative mx-auto flex aspect-square w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
              {tokenImage ? (
                <img src={tokenImage} alt="NPC token" className="h-full w-full object-cover" />
              ) : (
                <ImagePlusIcon aria-hidden="true" className="size-6" />
              )}
            </div>
            {editable && (
              <>
                <input
                  ref={tokenInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  aria-label="Choose token image"
                  onChange={handleTokenChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="w-full"
                  onClick={() => tokenInputRef.current?.click()}
                >
                  <UploadIcon aria-hidden="true" />
                  {tokenImage ? "Replace" : "Token"}
                </Button>
                {tokenImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="w-full"
                    onClick={() => { uploadVersion.current++; setImagePending(false); setImageError(""); onTokenImageChange(null); }}
                  >
                    <Trash2Icon aria-hidden="true" /> Remove
                  </Button>
                )}
                {imagePending && <p role="status" className="text-xs text-muted-foreground">Converting image…</p>}
                {imageError && <p role="alert" className="text-left text-xs text-destructive">{imageError}</p>}
              </>
            )}
            {!editable && <span className="block text-xs text-muted-foreground">Token</span>}
          </div>
        </div>

        {(editable || TEXT_FIELDS.slice(2, 5).some(({ key }) => fieldText(value[key]).trim())) && (
          <div className="grid gap-x-4 gap-y-3 border-y border-destructive/70 py-3 sm:grid-cols-2">
            {TEXT_FIELDS.slice(2, 5).map(({ key, label, placeholder }) => (
              <StatField
                key={key}
                label={label}
                value={fieldText(value[key])}
                editable={editable}
                placeholder={placeholder}
                onChange={(next) => update(key, next)}
              />
            ))}
          </div>
        )}

        {(editable || Object.values(value.abilityScores ?? {}).some(Boolean)) && (
          <div className="grid grid-cols-3 gap-2 border-b border-destructive/70 pb-3 sm:grid-cols-6">
            {ABILITIES.map(({ key, label }) => (
              <div key={key} className="min-w-0 text-center">
                <label htmlFor={`npc-ability-${key}`} className="text-xs font-semibold text-destructive">{label}</label>
                {editable ? (
                  <Input
                    id={`npc-ability-${key}`}
                    aria-label={`${label} ability score and modifier`}
                    value={value.abilityScores?.[key] ?? ""}
                    onChange={(event) => updateAbility(key, event.currentTarget.value)}
                    placeholder="10 (+0)"
                    className="mt-1 h-7 text-center"
                  />
                ) : (
                  <p className="mt-1 text-sm">{value.abilityScores?.[key] || "—"}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {(editable || TEXT_FIELDS.slice(5).some(({ key }) => fieldText(value[key]).trim())) && (
          <dl className="space-y-1.5 text-sm">
            {TEXT_FIELDS.slice(5).map(({ key, label, placeholder }) => {
              const text = fieldText(value[key]);
              if (!editable && !text.trim()) return null;
              return (
                <div key={key} className="grid gap-1 sm:grid-cols-[max-content_1fr] sm:gap-2">
                  <dt className="font-semibold text-destructive">{label}</dt>
                  <dd className="min-w-0">
                    {editable ? (
                      <Input
                        aria-label={label}
                        value={text}
                        onChange={(event) => update(key, event.currentTarget.value)}
                        placeholder={placeholder}
                        className="h-7"
                      />
                    ) : text}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        <div className="space-y-4">
          {FEATURE_GROUPS.map(({ key, label }) => {
            const features = value.features?.[key] ?? [];
            if (!editable && features.length === 0) return null;
            return (
              <section key={key} aria-label={label} className="border-t border-destructive/70 pt-3 first:border-0 first:pt-0">
                <h3 className="mb-2 font-semibold">{label}</h3>
                <div className="space-y-3">
                  {features.map((feature, index) => (
                    <div key={`${key}-${index}`} className="space-y-1">
                      {editable ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`${label} feature ${index + 1} name`}
                            value={feature.name}
                            onChange={(event) => {
                              const next = [...features];
                              next[index] = { ...feature, name: event.currentTarget.value };
                              updateFeatures(key, next);
                            }}
                            placeholder="Feature name"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${label.toLowerCase()} feature ${index + 1}`}
                            onClick={() => updateFeatures(key, features.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">
                          {feature.name && <strong className="mr-1 italic">{feature.name}.</strong>}
                          {feature.description}
                        </p>
                      )}
                      {editable && (
                        <AutoSizeTextarea
                          aria-label={`${label} feature ${index + 1} description`}
                          value={feature.description}
                          onChange={(event) => {
                            const next = [...features];
                            next[index] = { ...feature, description: event.currentTarget.value };
                            updateFeatures(key, next);
                          }}
                          placeholder="Describe this feature…"
                        />
                      )}
                    </div>
                  ))}
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => updateFeatures(key, [...features, { name: "", description: "" }])}
                  >
                    <PlusIcon aria-hidden="true" /> Add {label.toLowerCase()}
                  </Button>
                )}
              </section>
            );
          })}
        </div>

        {!editable && !hasAnyValue && !tokenImage && (
          <p className="text-sm text-muted-foreground">No D&amp;D 5.5e statblock has been added yet.</p>
        )}
      </div>
    </section>
  );
}

function StatField({
  label,
  value,
  editable,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[max-content_1fr] sm:items-center sm:gap-2">
      <span className="text-sm font-semibold text-destructive">{label}</span>
      {editable ? (
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          className="h-7"
        />
      ) : (
        <span className="text-sm">{value}</span>
      )}
    </div>
  );
}
