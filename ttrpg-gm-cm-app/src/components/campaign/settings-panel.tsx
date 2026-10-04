import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { statblockFieldSetLabel, useCampaign } from "@/lib/campaign-data";

import type { AppearanceMode } from "@/stores/preferences-store";
export type { AppearanceMode } from "@/stores/preferences-store";

export function SettingsPanel({ appearance, onAppearanceChange }: {
  appearance: AppearanceMode;
  onAppearanceChange: (appearance: AppearanceMode) => void;
}) {
  const statblockFieldSet = useCampaign((state) => state.campaign.statblockFieldSet);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 sm:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Appearance</h1>
          <p className="text-sm text-muted-foreground">Customize the app’s appearance.</p>
        </header>
        <section className="rounded-xl border bg-card p-5">
          <FieldSet>
            <div className="flex flex-col gap-1">
              <FieldLegend variant="label" className="mb-0">Theme</FieldLegend>
              <FieldDescription>Choose a theme, or follow your device’s appearance setting.</FieldDescription>
            </div>
            <ToggleGroup
              aria-label="Appearance theme"
              value={[appearance]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "system" || next === "light" || next === "dark") onAppearanceChange(next);
              }}
            >
              <ToggleGroupItem value="light" aria-label="Light appearance">
                <SunIcon />Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label="Dark appearance">
                <MoonIcon />Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system" aria-label="Use system appearance">
                <MonitorIcon />System
              </ToggleGroupItem>
            </ToggleGroup>
          </FieldSet>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <FieldSet>
            <div className="flex flex-col gap-1">
              <FieldLegend variant="label" className="mb-0">TTRPG system</FieldLegend>
              <FieldDescription>
                This campaign’s ruleset determines the fields used by NPC statblocks.
              </FieldDescription>
            </div>
            <p className="text-sm font-medium">{statblockFieldSetLabel(statblockFieldSet)}</p>
          </FieldSet>
        </section>
      </div>
    </div>
  );
}
