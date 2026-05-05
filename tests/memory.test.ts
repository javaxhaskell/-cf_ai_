import { describe, it, expect } from "vitest";
import { UserPrefsSchema, mergePrefs } from "../src/server/memory/kv.js";

describe("UserPrefs schema", () => {
  it("applies defaults", () => {
    const out = UserPrefsSchema.parse({});
    expect(out.voiceEnabled).toBe(true);
    expect(out.ttsEnabled).toBe(false);
    expect(out.preferredModel).toBe("primary");
    expect(out.recallThreshold).toBeCloseTo(0.72);
  });

  it("rejects out-of-range threshold", () => {
    expect(() => UserPrefsSchema.parse({ recallThreshold: 1.5 })).toThrow();
  });
});

describe("mergePrefs", () => {
  it("merges patches over current values", () => {
    const current = UserPrefsSchema.parse({});
    const merged = mergePrefs(current, { ttsEnabled: true, recallThreshold: 0.8 });
    expect(merged.ttsEnabled).toBe(true);
    expect(merged.recallThreshold).toBeCloseTo(0.8);
    expect(merged.voiceEnabled).toBe(true);
  });

  it("re-validates after merging (rejects bad patch)", () => {
    const current = UserPrefsSchema.parse({});
    expect(() => mergePrefs(current, { recallThreshold: -1 })).toThrow();
  });
});
