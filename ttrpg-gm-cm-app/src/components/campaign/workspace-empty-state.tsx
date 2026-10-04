import { SearchIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function WorkspaceEmptyState({ description, className = "" }: {
  description: string;
  className?: string;
}) {
  return (
    <Empty aria-label="Workspace empty state" className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Nothing open</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
