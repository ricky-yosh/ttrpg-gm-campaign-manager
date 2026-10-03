import assert from "node:assert/strict";
import test from "node:test";

let importId = 0;
async function withPreferencesStorage(storage, check) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const module = await import(`../src/stores/preferences-store.ts?test=${++importId}`);
    await check(module);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("appearance falls back to the legacy preference and persists only the new appearance field", async () => {
  const storage = memoryStorage({ "ttrpg-gm-cm-appearance": "dark" });
  await withPreferencesStorage(storage, ({ usePreferencesStore, PREFERENCES_STORAGE_KEY }) => {
    assert.equal(usePreferencesStore.getState().appearance, "dark");
    usePreferencesStore.getState().setAppearance("light");
    assert.deepEqual(JSON.parse(storage.values.get(PREFERENCES_STORAGE_KEY)), {
      state: { appearance: "light" }, version: 1,
    });
  });
});

test("valid stored preferences take precedence over the legacy preference", async () => {
  const storage = memoryStorage({
    "ttrpg-gm-cm-appearance": "dark",
    "ttrpg-gm-cm-preferences": JSON.stringify({ state: { appearance: "light" }, version: 1 }),
  });
  await withPreferencesStorage(storage, ({ usePreferencesStore }) => {
    assert.equal(usePreferencesStore.getState().appearance, "light");
  });
});

test("invalid stored values cannot replace actions or valid legacy appearance", async () => {
  const storage = memoryStorage({
    "ttrpg-gm-cm-appearance": "dark",
    "ttrpg-gm-cm-preferences": JSON.stringify({
      state: { appearance: "sepia", setAppearance: "injected action", commandPaletteOpen: true }, version: 1,
    }),
  });
  await withPreferencesStorage(storage, ({ usePreferencesStore }) => {
    assert.equal(usePreferencesStore.getState().appearance, "dark");
    assert.equal(typeof usePreferencesStore.getState().setAppearance, "function");
    assert.equal("commandPaletteOpen" in usePreferencesStore.getState(), false);
  });
});

test("malformed JSON and invalid legacy values fall back to system appearance", async () => {
  const storage = memoryStorage({
    "ttrpg-gm-cm-appearance": "invalid",
    "ttrpg-gm-cm-preferences": "{broken JSON",
  });
  await withPreferencesStorage(storage, ({ usePreferencesStore }) => {
    assert.equal(usePreferencesStore.getState().appearance, "system");
    usePreferencesStore.getState().setAppearance("dark");
    assert.equal(usePreferencesStore.getState().appearance, "dark");
  });
});

test("unavailable storage keeps appearance changes working for the session", async () => {
  const unavailable = () => { throw new Error("Storage unavailable"); };
  await withPreferencesStorage({ getItem: unavailable, setItem: unavailable, removeItem: unavailable }, ({ usePreferencesStore }) => {
    assert.equal(usePreferencesStore.getState().appearance, "system");
    assert.doesNotThrow(() => usePreferencesStore.getState().setAppearance("light"));
    assert.equal(usePreferencesStore.getState().appearance, "light");
  });
});
