import { useEffect, useRef, useState } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewReadyEvent } from "dockview-react";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { CharacterPanel } from "@/components/campaign/character-panel";
import { Topbar } from "@/components/campaign/topbar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchIcon } from "lucide-react";
import "./App.css";
import "dockview-react/dist/styles/dockview.css";

export type SavedLayout = { name: string; layout: ReturnType<DockviewReadyEvent["api"]["toJSON"]> };

const dockviewComponents = { character: CharacterPanel };

function App() {
  const [section, setSection] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [hasOpenPanels, setHasOpenPanels] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const dockviewApi = useRef<DockviewReadyEvent["api"] | null>(null);
  const layoutChangeSubscription = useRef<{ dispose: () => void } | null>(null);
  const restoringLayout = useRef(false);
  const activeLayoutRef = useRef<string | null>(null);
  const layoutsRef = useRef<SavedLayout[]>([]);

  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [activeLayout, setActiveLayout] = useState<string | null>(null);
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);

  layoutsRef.current = layouts;
  activeLayoutRef.current = activeLayout;

  const updateLayout = (name: string) => {
    const api = dockviewApi.current;
    if (!api) return;
    const saved = { name, layout: api.toJSON() };
    const next = layoutsRef.current.map((item) => item.name === name ? saved : item);
    layoutsRef.current = next;
    setLayouts(next);
    setIsLayoutDirty(false);
  };

  const saveAsNewLayout = (name: string) => {
    const api = dockviewApi.current;
    const normalizedName = name.trim();
    if (!api || !normalizedName || layoutsRef.current.some((item) => item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) return false;
    const next = [...layoutsRef.current, { name: normalizedName, layout: api.toJSON() }];
    layoutsRef.current = next;
    setLayouts(next);
    activeLayoutRef.current = normalizedName;
    setActiveLayout(normalizedName);
    setIsLayoutDirty(false);
    return true;
  };

  const applyLayout = (name: string) => {
    const saved = layoutsRef.current.find((item) => item.name === name);
    if (!saved || !dockviewApi.current) return;
    restoringLayout.current = true;
    activeLayoutRef.current = name;
    dockviewApi.current.fromJSON(saved.layout);
    setActiveLayout(name);
    setIsLayoutDirty(false);
    queueMicrotask(() => { restoringLayout.current = false; });
  };

  const switchLayoutWithChanges = (name: string, saveCurrent: boolean) => {
    if (saveCurrent && activeLayoutRef.current) updateLayout(activeLayoutRef.current);
    applyLayout(name);
  };

  const deleteLayout = (name: string) => {
    const next = layoutsRef.current.filter((layout) => layout.name !== name);
    layoutsRef.current = next;
    setLayouts(next);
    if (activeLayoutRef.current === name) {
      activeLayoutRef.current = null;
      setActiveLayout(null);
      setIsLayoutDirty(false);
    }
  };

  const openCharacter = (name: string) => {
    const api = dockviewApi.current;
    if (!api) return;

    const id = `character:${name}`;
    const existingPanel = api.getPanel(id);
    if (existingPanel) {
      existingPanel.api.setActive();
      return;
    }

    api.addPanel({
      id,
      title: name,
      component: "character",
      params: { name },
    });
  };

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      setIsDark(preference.matches);
      document.documentElement.classList.toggle("dark", preference.matches);
    };
    syncTheme();
    preference.addEventListener("change", syncTheme);
    return () => preference.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    const handleCloseTabShortcut = (event: KeyboardEvent) => {
      const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform);
      const hasPrimaryModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (!hasPrimaryModifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return;

      event.preventDefault();
      event.stopPropagation();
      dockviewApi.current?.activePanel?.api.close();
    };

    document.addEventListener("keydown", handleCloseTabShortcut, true);
    return () => document.removeEventListener("keydown", handleCloseTabShortcut, true);
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh flex-col overflow-hidden">
        <Topbar
          isCommandPaletteOpen={isCommandPaletteOpen}
          onCommandPaletteOpenChange={setIsCommandPaletteOpen}
          layouts={layouts}
          activeLayout={activeLayout}
          isLayoutDirty={isLayoutDirty}
          onSelectLayout={applyLayout}
          onSaveLayoutChanges={updateLayout}
          onSaveAsNewLayout={saveAsNewLayout}
          onDeleteLayout={deleteLayout}
          onSwitchWithChanges={switchLayoutWithChanges}
          onOpenCharacter={openCharacter}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar section={section} onSelectSection={setSection} onOpenCharacter={openCharacter} />
          <main aria-label="Campaign workspace" className="relative min-h-0 min-w-0 flex-1">
            <DockviewReact
              className="campaign-dockview"
              theme={isDark ? themeDark : themeLight}
              components={dockviewComponents}
              disableDnd={false}
              dndStrategy="pointer"
              onReady={(event) => {
                dockviewApi.current = event.api;
                setHasOpenPanels(event.api.panels.length > 0);
                layoutChangeSubscription.current?.dispose();
                layoutChangeSubscription.current = event.api.onDidLayoutChange(() => {
                  setHasOpenPanels(event.api.panels.length > 0);
                  if (restoringLayout.current) return;
                  const currentName = activeLayoutRef.current;
                  const saved = layoutsRef.current.find((item) => item.name === currentName);
                  if (!saved) return;
                  setIsLayoutDirty(JSON.stringify(event.api.toJSON()) !== JSON.stringify(saved.layout));
                });
              }}
            />
            {!hasOpenPanels && (
              <Empty aria-label="Workspace empty state" className="absolute inset-0 h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Nothing open</EmptyTitle>
                  <EmptyDescription>
                    Choose a section from the sidebar or search your campaign to open something.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={() => setIsCommandPaletteOpen(true)}>
                    <SearchIcon data-icon="inline-start" />
                    Search campaign
                    <Kbd className="ml-2">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</Kbd>
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
