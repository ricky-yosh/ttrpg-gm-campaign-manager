import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function WorkspaceEmptyState({ description, onSearch, className = "" }: {
  description: string;
  onSearch?: () => void;
  className?: string;
}) {
  return (
    <Empty aria-label="Workspace empty state" className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Nothing open</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onSearch && (
        <EmptyContent>
          <Button variant="outline" onClick={onSearch}>
            <SearchIcon data-icon="inline-start" />Search campaign
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
