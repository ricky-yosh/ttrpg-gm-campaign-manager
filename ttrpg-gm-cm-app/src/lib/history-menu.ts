import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NpcHistoryDirection } from "@/components/campaign/npc-history-context";

type HistoryMenuState = {
  undoLabel: string | null;
  redoLabel: string | null;
};

let current: HistoryMenuState;
let updateQueue = Promise.resolve();
let appliedState = "";

export async function listenForHistoryMenu(apply: (direction: NpcHistoryDirection) => void) {
  if (!isTauri()) return () => {};
  return listen<NpcHistoryDirection>("history-menu", ({ payload }) => apply(payload), { target: "main" });
}

export function updateHistoryMenu(state: HistoryMenuState) {
  if (!isTauri()) return;
  current = state;
  // Serialize updates and use the latest state after rapid focus or tab changes.
  updateQueue = updateQueue.then(async () => {
    const { undoLabel, redoLabel } = current;
    const next = { undoLabel, redoLabel };
    const serialized = JSON.stringify(next);
    if (serialized === appliedState) return;
    await invoke("set_history_menu", next);
    appliedState = serialized;
  }).catch((error: unknown) => console.error("Unable to update Undo/Redo menu", error));
}
