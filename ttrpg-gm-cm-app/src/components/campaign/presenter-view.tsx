import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { MapIcon, UsersIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { WorkspaceEmptyState } from "@/components/campaign/workspace-empty-state";
import { NpcPlayerCard } from "@/components/campaign/npc-player-card";
import { useCampaign } from "@/lib/campaign-data";

export type PresenterSection = "map" | "npcs";
export type PresenterWorkspaceHandle = {
  openMap: () => void;
  openNpc: (id: string, name: string) => void;
  closeActiveTab: () => void;
};

type PresenterPanelParams = { section: PresenterSection; npcId?: string; npcName?: string };

function PresenterPanel({ params }: IDockviewPanelProps) {
  const isNpc = params?.section === "npcs";
  const npcName = typeof params?.npcName === "string" ? params.npcName : null;
  const npcId = typeof params?.npcId === "string" ? params.npcId : null;
  const npc = useCampaign((state) => state.campaign.npcs.find((item) => item.id === npcId));

  if (isNpc && npc) {
    return (
      <div className="flex size-full min-h-0 flex-col overflow-auto bg-background p-6">
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Player preview</p>
        <NpcPlayerCard content={{
          name: npc.name,
          description: npc.presentation.playerDescription,
          portraitUrl: npc.presentation.portrait?.url ?? null,
        }} className="my-auto" />
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-0 items-center justify-center bg-background p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{isNpc ? <UsersIcon aria-hidden="true" /> : <MapIcon aria-hidden="true" />}</EmptyMedia>
          <EmptyTitle>
            {isNpc
              ? npcName ? `${npcName} is not ready to present` : "Choose an NPC"
              : "Map preview is not connected yet"}
          </EmptyTitle>
          <EmptyDescription>
            {isNpc
              ? "This NPC could not be found. Choose another NPC from the Presenter sidebar."
              : "Map selection and live preview controls will be added here. The separate player display stays in its own window."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

const presenterComponents = { presentation: PresenterPanel };

export function PresenterView({ ref, isDark, onActiveSelectionChange }: {
  ref: Ref<PresenterWorkspaceHandle>;
  isDark: boolean;
  onActiveSelectionChange: (section: PresenterSection, npcId: string | null, npcName: string | null) => void;
}) {
  const api = useRef<DockviewApi | null>(null);
  const activeSubscription = useRef<{ dispose: () => void } | null>(null);
  const layoutSubscription = useRef<{ dispose: () => void } | null>(null);
  const [hasPanels, setHasPanels] = useState(false);

  const addOrActivate = (params: PresenterPanelParams) => {
    const currentApi = api.current;
    if (!currentApi) return;

    const id = params.section === "map" ? "presenter:map" : `presenter:npc:${params.npcId}`;
    const existing = currentApi.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }

    currentApi.addPanel({
      id,
      title: params.section === "map" ? "Map" : params.npcName ?? "NPC",
      component: "presentation",
      params,
    });
  };

  useImperativeHandle(ref, () => ({
    openMap: () => addOrActivate({ section: "map" }),
    openNpc: (id, name) => addOrActivate({ section: "npcs", npcId: id, npcName: name }),
    closeActiveTab: () => api.current?.activePanel?.api.close(),
  }));

  useEffect(() => () => {
    activeSubscription.current?.dispose();
    layoutSubscription.current?.dispose();
  }, []);

  const handleReady = ({ api: dockviewApi }: { api: DockviewApi }) => {
    api.current = dockviewApi;
    setHasPanels(dockviewApi.panels.length > 0);
    layoutSubscription.current?.dispose();
    layoutSubscription.current = dockviewApi.onDidLayoutChange(() => setHasPanels(dockviewApi.panels.length > 0));
    activeSubscription.current?.dispose();
    activeSubscription.current = dockviewApi.onDidActivePanelChange(({ panel }) => {
      const params = panel?.params as PresenterPanelParams | undefined;
      if (params?.section === "npcs") {
        onActiveSelectionChange("npcs", params.npcId ?? null, params.npcName ?? null);
      } else {
        onActiveSelectionChange("map", null, null);
      }
    });
    addOrActivate({ section: "map" });
  };

  return (
    <main aria-label="Presenter View" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <DockviewReact
        className="campaign-dockview"
        theme={isDark ? themeDark : themeLight}
        components={presenterComponents}
        disableDnd
        disableFloatingGroups
        onReady={handleReady}
      />
      {!hasPanels && (
        <WorkspaceEmptyState
          className="absolute inset-0 h-full"
          description="Choose a view from the Presenter sidebar to open it here."
        />
      )}
    </main>
  );
}
