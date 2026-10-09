import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { useId } from "react";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { cn } from "@/lib/utils";

type NpcPlayerDescriptionProps = {
  description: string;
  portraitUrl: string | null;
  editable: boolean;
  withPortrait?: boolean;
  onDescriptionChange: (description: string) => void;
  onPortraitChange: (url: string | null) => void;
};

export function NpcPlayerDescription({
  description,
  portraitUrl,
  editable,
  withPortrait = false,
  onDescriptionChange,
  onPortraitChange,
}: NpcPlayerDescriptionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 id={headingId} className="font-semibold">Description for Players</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Public</span>
      </div>
      <div className={cn("flex flex-col gap-4", withPortrait && "sm:flex-row")}>
        {withPortrait && (
          <div className="w-full shrink-0 sm:w-1/3">
            <NpcImageField
              editable={editable}
              label=""
              value={portraitUrl}
              onChange={onPortraitChange}
              aspectRatio="4 / 5"
              fit="contain"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {editable ? (
            <AutoSizeTextarea
              aria-label="Description for Players"
              value={description}
              onChange={(event) => onDescriptionChange(event.currentTarget.value)}
              placeholder="Write a few sentences players can see when this NPC is presented…"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {description || "No player description has been added yet."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
