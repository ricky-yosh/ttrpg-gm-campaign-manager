import { MenuItem, type Submenu } from "@tauri-apps/api/menu";
import type { NpcHistoryDirection } from "@/components/campaign/npc-history-context";

type HistoryMenuState = {
  undoLabel: string | null;
  redoLabel: string | null;
};

let current: HistoryMenuState = { undoLabel: null, redoLabel: null };
let menuItems: { undo: MenuItem; redo: MenuItem } | undefined;
let applyHistory: ((direction: NpcHistoryDirection) => void) | undefined;
let updateQueue = Promise.resolve();

export async function installHistoryMenuItems(editMenu: Submenu) {
  const undo = await MenuItem.new({
    id: "history-undo",
    text: "Undo",
    enabled: false,
    accelerator: "CmdOrCtrl+Z",
    action: () => applyMenuAction("undo"),
  });
  const redo = await MenuItem.new({
    id: "history-redo",
    text: "Redo",
    enabled: false,
    accelerator: "CmdOrCtrl+Shift+Z",
    action: () => applyMenuAction("redo"),
  });

  await editMenu.removeAt(0);
  await editMenu.removeAt(0);
  await editMenu.insert([undo, redo], 0);
  menuItems = { undo, redo };
  updateHistoryMenu(current);
}

function applyMenuAction(direction: NpcHistoryDirection) {
  applyHistory?.(direction);
}

export function registerHistoryMenuActionHandler(handler: (direction: NpcHistoryDirection) => void) {
  applyHistory = handler;
  return () => {
    if (applyHistory === handler) applyHistory = undefined;
  };
}

export function updateHistoryMenu(state: HistoryMenuState) {
  current = state;
  if (!menuItems) return;

  updateQueue = updateQueue.then(async () => {
    const next = current;
    const { undo, redo } = menuItems!;
    await Promise.all([
      undo.setText(next.undoLabel ? `Undo ${next.undoLabel}` : "Undo"),
      undo.setEnabled(next.undoLabel !== null),
      redo.setText(next.redoLabel ? `Redo ${next.redoLabel}` : "Redo"),
      redo.setEnabled(next.redoLabel !== null),
    ]);
  }).catch((error: unknown) => console.error("Unable to update Undo/Redo menu", error));
}
