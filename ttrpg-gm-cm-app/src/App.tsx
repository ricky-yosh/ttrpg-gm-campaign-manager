import { useEffect, useRef, useState } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import { AppSidebar } from "@/components/campaign/app-sidebar";
import { Topbar } from "@/components/campaign/topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./App.css";
import "dockview-react/dist/styles/dockview.css";

export type SavedLayout = { name: string; layout: ReturnType<DockviewReadyEvent["api"]["toJSON"]> };

function CharacterPanel({ params }: IDockviewPanelProps) {
  const name = typeof params.name === "string" ? params.name : "Character";

  return (
    <article className="h-full overflow-auto p-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">NPC</p>
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Character details will appear here. Drag this tab to a workspace edge to create a split, or drop it in another pane to join that pane’s tabs.
      </p>
    </article>
  );
}

const dockviewComponents = { character: CharacterPanel };

function App() {
  const [section, setSection] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
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
          <main aria-label="Campaign workspace" className="min-h-0 min-w-0 flex-1">
            <DockviewReact
              className="campaign-dockview"
              theme={isDark ? themeDark : themeLight}
              components={dockviewComponents}
              disableDnd={false}
              dndStrategy="pointer"
              onReady={(event) => {
                dockviewApi.current = event.api;
                layoutChangeSubscription.current?.dispose();
                layoutChangeSubscription.current = event.api.onDidLayoutChange(() => {
                  if (restoringLayout.current) return;
                  const currentName = activeLayoutRef.current;
                  const saved = layoutsRef.current.find((item) => item.name === currentName);
                  if (!saved) return;
                  setIsLayoutDirty(JSON.stringify(event.api.toJSON()) !== JSON.stringify(saved.layout));
                });
              }}
            />
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
