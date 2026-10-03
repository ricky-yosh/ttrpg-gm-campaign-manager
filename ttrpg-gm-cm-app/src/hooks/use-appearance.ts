import { useEffect, useSyncExternalStore } from "react";
import { usePreferencesStore } from "@/stores/preferences-store";

const query = "(prefers-color-scheme: dark)";
function subscribeToSystemTheme(listener: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener("change", listener);
  return () => preference.removeEventListener("change", listener);
}
const readSystemTheme = () => window.matchMedia(query).matches;

export function useAppearance() {
  const appearance = usePreferencesStore((state) => state.appearance);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, readSystemTheme, () => false);
  const isDark = appearance === "dark" || (appearance === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);
  return { appearance, isDark, setAppearance: usePreferencesStore.getState().setAppearance };
}
