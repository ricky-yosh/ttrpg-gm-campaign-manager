import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type AppearanceMode = "system" | "light" | "dark";
const LEGACY_APPEARANCE_KEY = "ttrpg-gm-cm-appearance";
export const PREFERENCES_STORAGE_KEY = "ttrpg-gm-cm-preferences";

function isAppearance(value: unknown): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark";
}

const storage: StateStorage = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Session preferences still work. */ } },
  removeItem: (key) => { try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } },
};

function legacyAppearance(): AppearanceMode {
  const value = storage.getItem(LEGACY_APPEARANCE_KEY);
  return isAppearance(value) ? value : "system";
}

type PreferencesState = {
  appearance: AppearanceMode;
  setAppearance: (appearance: AppearanceMode) => void;
};

export const usePreferencesStore = create<PreferencesState>()(persist(
  (set) => ({ appearance: legacyAppearance(), setAppearance: (appearance) => set({ appearance }) }),
  {
    name: PREFERENCES_STORAGE_KEY,
    version: 1,
    storage: createJSONStorage(() => storage),
    partialize: ({ appearance }) => ({ appearance }),
    merge: (persisted, current) => {
      const appearance = (persisted as { appearance?: unknown } | null)?.appearance;
      return { ...current, appearance: isAppearance(appearance) ? appearance : current.appearance };
    },
  },
));
