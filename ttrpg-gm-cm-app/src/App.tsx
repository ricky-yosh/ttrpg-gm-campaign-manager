import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { SettingsPanel } from "@/components/campaign/settings-panel";
import { Workspaces, type WorkspaceHandle } from "@/components/campaign/workspaces";
import { Topbar } from "@/components/campaign/topbar";
import { leaveCampaign, listenForCampaignOpens, saveCampaign, setUnsavedChoiceHandler, useCampaign, type LeaveIntent, type UnsavedChoice } from "@/lib/campaign-data";
import { appCommands, registerWorkspaceCommands } from "@/lib/app-commands";
import { useSessionStore } from "@/stores/session-store";
import { useAppearance } from "@/hooks/use-appearance";
import "@/lib/session-lifecycle";
import "./App.css";
import "dockview-react/dist/styles/dockview.css";

function CampaignAutosave() {
  const { path, revision, savedRevision, isLeaving } = useCampaign(useShallow((state) => ({
    path: state.path, revision: state.revision, savedRevision: state.savedRevision, isLeaving: state.isLeaving,
  })));
  useEffect(() => {
    if (isLeaving || !path || revision === savedRevision) return;
    const timeout = window.setTimeout(() => { void saveCampaign(false); }, 750);
    return () => window.clearTimeout(timeout);
  }, [path, revision, savedRevision, isLeaving]);
  return null;
}

function App() {
  const { campaignName, generation, isLeaving, hasPath } = useCampaign(useShallow((state) => ({
    campaignName: state.campaign.name, generation: state.generation, isLeaving: state.isLeaving, hasPath: state.path !== null,
  })));
  const section = useSessionStore((state) => state.section);
  const sidebarOpen = useSessionStore((state) => state.sidebar.open);
  const isPresenting = useSessionStore((state) => state.presentationStartedAt !== null);
  const { appearance, isDark, setAppearance } = useAppearance();
  const [leaveIntent, setLeaveIntent] = useState<LeaveIntent | null>(null);
  const choiceResolver = useRef<((choice: UnsavedChoice) => void) | null>(null);
  const workspaces = useRef<WorkspaceHandle>(null);
  useLayoutEffect(() => registerWorkspaceCommands(generation, () => workspaces.current), [generation]);

  const resolveChoice = (choice: UnsavedChoice) => {
    choiceResolver.current?.(choice);
    choiceResolver.current = null;
    setLeaveIntent(null);
  };
  useEffect(() => {
    const stop = setUnsavedChoiceHandler((intent) => new Promise((resolve) => {
      choiceResolver.current = resolve;
      setLeaveIntent(intent);
    }));
    return () => { stop(); choiceResolver.current?.("cancel"); choiceResolver.current = null; };
  }, []);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void listenForCampaignOpens().then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let closing = false;
    const currentWindow = getCurrentWindow();
    void currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      await leaveCampaign("close", () => currentWindow.destroy());
      closing = false;
    }).then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; });
    return () => { disposed = true; stop?.(); };
  }, []);
  useEffect(() => {
    const handleCloseTabShortcut = (event: KeyboardEvent) => {
      const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform);
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (!hasPrimaryModifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return;
      event.preventDefault();
      event.stopPropagation();
      appCommands.closeActiveTab();
    };
    document.addEventListener("keydown", handleCloseTabShortcut, true);
    return () => document.removeEventListener("keydown", handleCloseTabShortcut, true);
  }, []);
  useEffect(() => {
    const clearTabDragging = () => { delete document.documentElement.dataset.tabDragging; };
    const startTabDragging = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest(".campaign-dockview .dv-tab")) return;
      document.documentElement.dataset.tabDragging = "true";
    };
    document.addEventListener("pointerdown", startTabDragging, true);
    window.addEventListener("pointerup", clearTabDragging, true);
    window.addEventListener("pointercancel", clearTabDragging, true);
    window.addEventListener("blur", clearTabDragging);
    return () => {
      document.removeEventListener("pointerdown", startTabDragging, true);
      window.removeEventListener("pointerup", clearTabDragging, true);
      window.removeEventListener("pointercancel", clearTabDragging, true);
      window.removeEventListener("blur", clearTabDragging);
      clearTabDragging();
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="relative h-svh overflow-hidden" data-presenting={isPresenting ? "true" : undefined}>
        <CampaignAutosave />
        <SidebarProvider key={generation} open={sidebarOpen} onOpenChange={(open) => useSessionStore.getState().setSidebar({ open })} inert={isLeaving} className="h-full flex-col overflow-hidden">
          <Topbar />
          <div className="flex min-h-0 flex-1">
            <AppSidebar />
            <main aria-label="Campaign workspace" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {section === "Settings" && (
                <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                  <SettingsPanel appearance={appearance} onAppearanceChange={setAppearance} />
                </div>
              )}
              <div className="absolute inset-0 flex" aria-hidden={section === "Settings"} inert={section === "Settings"}>
                <Workspaces key={generation} ref={workspaces} isDark={isDark} onSearch={appCommands.openCommandPalette} />
              </div>
            </main>
          </div>
        </SidebarProvider>
        {isPresenting && <div className="presenter-frame" aria-hidden="true" />}
      </div>
      <Dialog open={leaveIntent !== null} onOpenChange={(open) => { if (!open) resolveChoice("cancel"); }}>
        <DialogPopup>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <DialogTitle>Save {campaignName} before {leaveIntent === "close" ? "closing" : "switching campaigns"}?</DialogTitle>
              <DialogDescription>
                {hasPath ? "Changes since the last save will be lost if you don’t save. Previously saved data will remain on disk."
                  : "This campaign has not been saved. If you don’t save, it will be discarded without creating a campaign file."}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => resolveChoice("cancel")}>Cancel</Button>
              <Button variant="outline" onClick={() => resolveChoice("discard")}>
                {leaveIntent === "close" ? "Close without saving" : "Don’t save"}
              </Button>
              <Button onClick={() => resolveChoice("save")}>{leaveIntent === "close" ? "Save and close" : "Save and continue"}</Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </TooltipProvider>
  );
}

export default App;
