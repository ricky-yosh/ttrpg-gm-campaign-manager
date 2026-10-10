import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appCommands } from "@/lib/app-commands";
import { installHistoryMenuItems } from "@/lib/history-menu";

let nativeMenuPromise: Promise<void> | null = null;

export function installNativeMenu() {
  if (!isTauri()) return Promise.resolve();
  if (!nativeMenuPromise) {
    nativeMenuPromise = createNativeMenu().catch((error: unknown) => {
      nativeMenuPromise = null;
      throw error;
    });
  }
  return nativeMenuPromise;
}

async function createNativeMenu() {
  const isMacOS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const menu = await Menu.default();
  const fileItems = [
    await MenuItem.new({ id: "campaign-new", text: "New Campaign", accelerator: "CmdOrCtrl+N", action: () => appCommands.newCampaign() }),
    await MenuItem.new({ id: "campaign-open", text: "Open Campaign…", accelerator: "CmdOrCtrl+O", action: () => void appCommands.openCampaign() }),
    await PredefinedMenuItem.new({ item: "Separator" }),
    await MenuItem.new({ id: "campaign-save", text: "Save Campaign", accelerator: "CmdOrCtrl+S", action: () => void appCommands.saveCampaign() }),
    await MenuItem.new({ id: "campaign-save-as", text: "Save As…", accelerator: "CmdOrCtrl+Shift+S", action: () => void appCommands.saveCampaignAs() }),
  ];

  const existingItems = await menu.items();
  let fileMenu: Submenu | undefined;
  let editMenu: Submenu | undefined;
  let appMenu: Submenu | undefined;
  for (const item of existingItems) {
    if (item instanceof Submenu) {
      const text = await item.text();
      if (text === "File") fileMenu = item;
      else if (text === "Edit") editMenu = item;
      else if (!appMenu) appMenu = item;
    }
  }

  if (editMenu) await installHistoryMenuItems(editMenu);
  if (isMacOS && appMenu) {
    await appMenu.insert(await MenuItem.new({
      id: "app-settings",
      text: "Settings…",
      accelerator: "CmdOrCtrl+,",
      action: () => appCommands.openSettings(),
    }), 1);
  }

  if (fileMenu) await fileMenu.prepend(fileItems);
  else if (isMacOS) await menu.insert(await Submenu.new({ text: "File", items: fileItems }), 1);
  else await menu.prepend(await Submenu.new({ text: "File", items: fileItems }));

  if (isMacOS) await menu.setAsAppMenu();
  else await menu.setAsWindowMenu(getCurrentWindow());
}
