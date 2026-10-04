import { MonitorIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function PresenterView() {
  return (
    <main aria-label="Presenter View" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="border-b px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presentation controls</p>
        <h1 className="mt-1 text-lg font-semibold">Presenter View</h1>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><MonitorIcon aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Choose what players see</EmptyTitle>
            <EmptyDescription>
              This is where you’ll manage the map and NPCs shown on the separate Presentation Screen. Your GM workspace stays available when you switch back.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </main>
  );
}
