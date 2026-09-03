"use client";

// ─────────────────────────────────────────────────────────────
// アプリ設定（key-value）ストア（本番: Supabase app_settings）
//   当面は団体名（lom_name）のみ。マスターだけが変更できる（RLS）。
// ─────────────────────────────────────────────────────────────

import { db, fire } from "./backend/client";
import { LOM_NAME_DEFAULT } from "./lom";

export type SettingsMap = Record<string, string>;

let cache: SettingsMap = {};
let hydrated = false;
const EMPTY: SettingsMap = {};
const listeners = new Set<() => void>();

export function isHydrated(): boolean {
  return hydrated;
}
function notify() {
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getStore(): SettingsMap {
  return cache;
}
export function getStoreDefault(): SettingsMap {
  return EMPTY;
}

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("app_settings").select("*");
  if (error) {
    console.error("[settingsStore] hydrate 失敗:", error.message);
    return;
  }
  const next: SettingsMap = {};
  for (const r of (data ?? []) as { key: string; value: string }[]) {
    next[r.key] = r.value;
  }
  cache = next;
  hydrated = true;
  notify();
}

export function getSetting(key: string, fallback = ""): string {
  const v = cache[key];
  return v != null && v !== "" ? v : fallback;
}

/** 団体名。app_settings.lom_name があればそれ、無ければ env / 既定。 */
export function lomName(): string {
  return getSetting("lom_name", LOM_NAME_DEFAULT);
}

export function setSetting(key: string, value: string): void {
  cache = { ...cache, [key]: value };
  notify();
  fire(
    db()
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() })
  );
}
