import { PlayIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { isMobile, open } = useSidebar();
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header
      data-macos={isMacOS ? "true" : undefined}
      className="app-topbar grid h-11 shrink-0 grid-cols-[1fr_minmax(0,24rem)_1fr] items-center gap-3 border-b px-3"
    >
      <div data-tauri-drag-region className="flex h-full items-center">
        <div className="macos-traffic-light-space" aria-hidden="true" data-tauri-drag-region />
        <div className={cn(
          "sidebar-trigger-slot flex h-full shrink-0 items-center justify-center transition-[width] duration-200",
          isMobile || !open ? "w-12" : "w-64",
        )}>
          <SidebarTrigger title="Toggle sidebar" />
        </div>
      </div>
      <Button variant="outline" className="w-full justify-start" aria-disabled="true" title="Search — coming soon">
        <SearchIcon data-icon="inline-start" />
        <span className="truncate">Search campaign…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd>
      </Button>
      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <Button size="icon" aria-label="Play presentation" aria-disabled="true" title="Play presentation — coming soon">
          <PlayIcon data-icon="inline-start" />
        </Button>
      </div>
    </header>
  );
}
