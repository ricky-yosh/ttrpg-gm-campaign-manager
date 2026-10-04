import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeftIcon, ArrowRightIcon, MonitorIcon, MoreHorizontalIcon, NotebookTextIcon, PauseIcon, PlayIcon, SearchIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/campaign/command-palette";
import { appCommands } from "@/lib/app-commands";
import { selectCanGoBack, selectCanGoForward, useSessionStore } from "@/stores/session-store";
import { CampaignControls } from "@/components/campaign/campaign-controls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { closePlayerPresentationWindow, openPlayerPresentationWindow, publishPresentationStatus } from "@/lib/presentation-window";

export function Topbar({ isPresenterView, onTogglePresenterView, onCloseActiveTab }: {
  isPresenterView: boolean;
  onTogglePresenterView: () => void;
  onCloseActiveTab: () => void;
}) {
  const canGoBack = useSessionStore(selectCanGoBack);
  const canGoForward = useSessionStore(selectCanGoForward);
  const presentationStartedAt = useSessionStore((state) => state.presentationStartedAt);
  const presentationElapsedMs = useSessionStore((state) => state.presentationElapsedMs);
  const presentationPaused = useSessionStore((state) => state.presentationPaused);
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isPresenting = presentationStartedAt !== null || presentationPaused;

  useEffect(() => {
    if (!presentationStartedAt) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [presentationStartedAt]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      const isInDialog = Boolean(element?.closest('[role="dialog"]'));
      const isInRichTextEditor = Boolean(element?.closest('[contenteditable="true"]'));
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;

      if (
        event.repeat || isInDialog || isInRichTextEditor || event.altKey || event.shiftKey ||
        !hasPrimaryModifier || event.key.toLowerCase() !== "k"
      ) return;

      event.preventDefault();
      appCommands.openCommandPalette();
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [isMacOS]);

  useEffect(() => {
    const handleSettingsShortcut = (event: KeyboardEvent) => {
      const hasPrimaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.repeat || event.altKey || event.shiftKey || !hasPrimaryModifier || event.key !== "," ||
        target?.closest('[role="dialog"]')
      ) return;

      event.preventDefault();
      appCommands.openSettings();
    };

    window.addEventListener("keydown", handleSettingsShortcut);
    return () => {
      window.removeEventListener("keydown", handleSettingsShortcut);
    };
  }, [isMacOS]);

  useEffect(() => {
    if (!isTauri()) return;

    const currentWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const syncFullscreen = () => {
      void currentWindow.isFullscreen().then((fullscreen) => {
        if (!disposed) setIsFullscreen(fullscreen);
      });
    };

    syncFullscreen();
    void currentWindow.onResized(syncFullscreen).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <header
      data-tauri-drag-region="deep"
      data-macos={isMacOS && !isFullscreen ? "true" : undefined}
      className="app-topbar flex h-11 shrink-0 items-center gap-1 border-b px-1 sm:gap-2 sm:px-3"
    >
      <div className="flex h-full min-w-0 shrink-0 items-center">
        <div className="macos-traffic-light-space" aria-hidden="true" data-tauri-drag-region />
        <CampaignControls />
        <div className="flex h-full w-9 shrink-0 items-center justify-center sm:w-12">
          <SidebarTrigger data-tauri-drag-region="false" title="Toggle sidebar" />
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            disabled={!canGoBack}
            onClick={appCommands.goBack}
            title="Back"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            data-tauri-drag-region="false"
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            disabled={!canGoForward}
            onClick={appCommands.goForward}
            title="Forward"
          >
            <ArrowRightIcon />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button data-tauri-drag-region="false" variant="ghost" size="icon-sm" className="sm:hidden" aria-label="Navigation history" title="Navigation history">
              <MoreHorizontalIcon />
            </Button>
          } />
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!canGoBack} onClick={appCommands.goBack}>
              <ArrowLeftIcon />Back
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canGoForward} onClick={appCommands.goForward}>
              <ArrowRightIcon />Forward
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        data-tauri-drag-region="false"
        variant="outline"
        size="sm"
        className="mx-auto min-w-9 w-full max-w-80 flex-1 justify-start max-sm:mx-0 max-sm:w-9 max-sm:flex-none max-sm:justify-center"
        aria-label="Search campaign"
        title={`Search campaign (${isMacOS ? "⌘K" : "Ctrl+K"})`}
        onClick={() => appCommands.openCommandPalette()}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="hidden min-w-0 truncate sm:inline">Search campaign…</span>
        <Kbd className="ml-auto hidden shrink-0 lg:inline-flex">{isMacOS ? "⌘ K" : "Ctrl K"}</Kbd>
      </Button>
      <div className="flex h-full shrink-0 items-center justify-end gap-1 sm:gap-2">
        {isPresenting && (
          <div className="flex items-center gap-1 rounded-md px-1 py-1 text-xs sm:mr-1 sm:gap-2 sm:px-2" role="status" aria-label="Presentation in progress">
            <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
            <span className="hidden font-medium md:inline">{presentationPaused ? "Paused" : "Presenting"}</span>
            <time className="font-mono text-[0.7rem] tabular-nums text-muted-foreground sm:text-xs" aria-label="Presentation elapsed time">
              {formatElapsedTime(presentationElapsedMs + (presentationStartedAt === null ? 0 : now - presentationStartedAt))}
            </time>
          </div>
        )}
        {isPresenting && (
          <Button
            data-tauri-drag-region="false"
            variant="outline"
            size="icon-sm"
            aria-label={presentationPaused ? "Resume presentation" : "Pause presentation"}
            title={presentationPaused ? "Resume presentation" : "Pause presentation"}
            onClick={() => {
              const session = useSessionStore.getState();
              if (presentationPaused) session.resumePresentation();
              else session.pausePresentation();
              void publishPresentationStatus(presentationPaused ? "live" : "paused");
            }}
          >
            {presentationPaused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3" />}
          </Button>
        )}
        <Button
          data-tauri-drag-region="false"
          variant="outline"
          size="icon-sm"
          aria-label={isPresenting ? "Stop presentation" : "Start presentation"}
          title={isPresenting ? "Stop presentation" : "Start presentation"}
          onClick={() => {
            if (isPresenting) {
              useSessionStore.getState().stopPresentation();
              void publishPresentationStatus("stopped");
              void closePlayerPresentationWindow();
            } else {
              void openPlayerPresentationWindow().then(() => {
                useSessionStore.getState().startPresentation();
                return publishPresentationStatus("live");
              }).catch((error: unknown) => console.error("Could not open the player presentation window", error));
            }
          }}
        >
          {isPresenting ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
        </Button>
        <Button
          data-tauri-drag-region="false"
          variant="outline"
          size="icon-sm"
          aria-label={isPresenterView ? "Return to GM View" : "Enter Presenter View"}
          title={isPresenterView ? "Return to GM View" : "Enter Presenter View"}
          onClick={onTogglePresenterView}
        >
          {isPresenterView ? <NotebookTextIcon className="size-3.5" /> : <MonitorIcon className="size-3.5" />}
        </Button>
      </div>
      <CommandPalette isPresenterView={isPresenterView} onTogglePresenterView={onTogglePresenterView} onCloseActiveTab={onCloseActiveTab} />
    </header>
  );
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}
