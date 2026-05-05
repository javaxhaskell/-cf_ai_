import { z } from "zod";
import type { Env } from "../types.js";

export const UserPrefsSchema = z.object({
  voiceEnabled: z.boolean().default(true),
  ttsEnabled: z.boolean().default(false),
  preferredModel: z.enum(["primary", "fallback"]).default("primary"),
  recallThreshold: z.number().min(0).max(1).default(0.72),
});

export type UserPrefs = z.infer<typeof UserPrefsSchema>;

const DEFAULT_PREFS: UserPrefs = {
  voiceEnabled: true,
  ttsEnabled: false,
  preferredModel: "primary",
  recallThreshold: 0.72,
};

export async function loadPrefs(env: Env, sessionId: string): Promise<UserPrefs> {
  const raw = await env.PREFS.get(`prefs:${sessionId}`, "json");
  if (!raw) return DEFAULT_PREFS;
  const parsed = UserPrefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export async function savePrefs(env: Env, sessionId: string, prefs: UserPrefs): Promise<void> {
  await env.PREFS.put(`prefs:${sessionId}`, JSON.stringify(prefs), {
    expirationTtl: 60 * 60 * 24 * 365,
  });
}

export function mergePrefs(current: UserPrefs, patch: Partial<UserPrefs>): UserPrefs {
  return UserPrefsSchema.parse({ ...current, ...patch });
}
