import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SidebarSectionHeading({ title, actionLabel, onCreate, className }: {
  title: string;
  actionLabel: string;
  onCreate: () => void;
  className?: string;
}) {
  return <div className={cn("flex min-w-0 items-center justify-between gap-2", className)}>
    <span className="truncate text-xs font-semibold text-muted-foreground">{title}</span>
    <Button type="button" variant="outline" size="icon-sm" aria-label={actionLabel} title={actionLabel} onClick={onCreate}>
      <PlusIcon aria-hidden="true" />
    </Button>
  </div>;
}
