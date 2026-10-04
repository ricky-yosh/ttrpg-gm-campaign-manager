import { UserRoundIcon } from "lucide-react";
import { cn } from "cn";

export type NpcPlayerContent = {
  name: string;
  description: string;
  portraitUrl: string | null;
};

export function NpcPlayerCard({ content, className }: { content: NpcPlayerContent; className?: string }) {
  return (
    <article className={cn("mx-auto flex w-full max-w-5xl flex-col items-center gap-8 text-center sm:flex-row sm:text-left", className)}>
      <div className="flex aspect-[3/4] w-full max-w-sm shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-card shadow-xl sm:w-[38%]">
        {content.portraitUrl ? (
          <img src={content.portraitUrl} alt={content.name} className="size-full object-contain" />
        ) : (
          <UserRoundIcon aria-hidden="true" className="size-16 text-muted-foreground" />
        )}
      </div>
      <div className="max-w-2xl space-y-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{content.name}</h1>
        {content.description ? (
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{content.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">The GM hasn’t added a player description yet.</p>
        )}
      </div>
    </article>
  );
}
