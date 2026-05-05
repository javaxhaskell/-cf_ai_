import { describe, it, expect, vi } from "vitest";
import { loadPrefs, savePrefs, mergePrefs, UserPrefsSchema } from "../src/server/memory/kv.js";
import type { Env } from "../src/server/types.js";

function makeKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const raw = store.get(key);
      if (!raw) return null;
      if (type === "json") return JSON.parse(raw);
      return raw;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    _store: store,
  };
}

describe("kv prefs", () => {
  it("loadPrefs returns defaults when key missing", async () => {
    const kv = makeKv();
    const env = { PREFS: kv } as unknown as Env;
    const prefs = await loadPrefs(env, "nobody");
    expect(prefs).toEqual(UserPrefsSchema.parse({}));
    expect(kv.get).toHaveBeenCalledWith("prefs:nobody", "json");
  });

  it("savePrefs writes JSON with TTL and loadPrefs reads it back", async () => {
    const kv = makeKv();
    const env = { PREFS: kv } as unknown as Env;
    const start = UserPrefsSchema.parse({});
    const next = mergePrefs(start, { ttsEnabled: true, recallThreshold: 0.65 });
    await savePrefs(env, "abc", next);
    expect(kv.put).toHaveBeenCalled();
    const loaded = await loadPrefs(env, "abc");
    expect(loaded.ttsEnabled).toBe(true);
    expect(loaded.recallThreshold).toBeCloseTo(0.65);
  });

  it("loadPrefs falls back to defaults when stored value is invalid", async () => {
    const kv = makeKv();
    const env = { PREFS: kv } as unknown as Env;
    kv._store.set("prefs:bad", JSON.stringify({ recallThreshold: -99 }));
    const prefs = await loadPrefs(env, "bad");
    expect(prefs).toEqual(UserPrefsSchema.parse({}));
  });
});
