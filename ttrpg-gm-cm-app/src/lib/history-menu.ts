import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem, Submenu } from "@tauri-apps/api/menu";
import type { NpcHistoryDirection } from "@/components/campaign/npc-history-context";

type HistoryMenuState = {
  textEditing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  apply: (direction: NpcHistoryDirection) => void;
};

let current: HistoryMenuState;
let menuPromise: ReturnType<typeof createHistoryMenu> | undefined;
let updateQueue = Promise.resolve();

async function createHistoryMenu() {
  const menu = await Menu.default();
  let edit: Submenu | undefined;
  for (const item of await menu.items()) {
    if (item instanceof Submenu && await item.text() === "Edit") edit = item;
  }
  if (!edit) throw new Error("The default Edit menu is missing.");
  // Tauri's default Edit menu starts with the native Undo and Redo items.
  const native = (await edit.items()).slice(0, 2);
  const undo = await MenuItem.new({ id: "npc-undo", text: "Undo", enabled: false,
    accelerator: "CmdOrCtrl+Z", action: () => current.apply("undo") });
  const redo = await MenuItem.new({ id: "npc-redo", text: "Redo", enabled: false,
    accelerator: "CmdOrCtrl+Shift+Z", action: () => current.apply("redo") });
  await menu.setAsAppMenu();
  return { edit, native, undo, redo, textEditing: true, canUndo: false, canRedo: false };
}

export function updateHistoryMenu(state: HistoryMenuState) {
  if (!isTauri()) return;
  current = state;
  menuPromise ??= createHistoryMenu();
  // Serialize native menu mutations so rapid focus changes cannot reorder items.
  updateQueue = updateQueue.then(async () => {
    const menu = await menuPromise!;
    const state = current;
    if (menu.canUndo !== state.canUndo) {
      await menu.undo.setEnabled(state.canUndo);
      menu.canUndo = state.canUndo;
    }
    if (menu.canRedo !== state.canRedo) {
      await menu.redo.setEnabled(state.canRedo);
      menu.canRedo = state.canRedo;
    }
    if (menu.textEditing === state.textEditing) return;
    await menu.edit.removeAt(0);
    await menu.edit.removeAt(0);
    await menu.edit.insert(state.textEditing ? menu.native : [menu.undo, menu.redo], 0);
    menu.textEditing = state.textEditing;
  }).catch((error: unknown) => console.error("Unable to update Undo/Redo menu", error));
}
