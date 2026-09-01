"use client";

// ─────────────────────────────────────────────────────────────
// ロール × 操作権限の上書きストア
//
// 既定値は permissions.ts の DEFAULT_PERMS。Supabase `role_perm_overrides`
// テーブルには「既定から変更した分」だけを行として保存する。
// master は常に全許可・編集不可。
// ─────────────────────────────────────────────────────────────

import { Role } from "./yearStore";
import { Capability, DEFAULT_PERMS } from "./permissions";
import { db } from "./backend/client";

/** 既定からの上書き分のみ（未指定なら DEFAULT_PERMS を使う） */
export type RolePermOverrides = Partial<
  Record<Role, Partial<Record<Capability, boolean>>>
>;

const EMPTY: RolePermOverrides = {};
let cache: RolePermOverrides = {};
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("role_perm_overrides").select("*");
  if (error) {
    console.error("[rolePermStore] hydrate 失敗:", error.message);
    return;
  }
  const next: RolePermOverrides = {};
  for (const r of (data ?? []) as {
    role: Role;
    capability: Capability;
    allowed: boolean;
  }[]) {
    (next[r.role] ??= {})[r.capability] = r.allowed;
  }
  cache = next;
  notify();
}

export function getStore(): RolePermOverrides {
  return cache;
}
export function getStoreDefault(): RolePermOverrides {
  return EMPTY;
}

/** 実効権限：master は常に全許可。それ以外は 上書き → 既定 の順で解決 */
export function can(role: Role, cap: Capability): boolean {
  if (role === "master") return true;
  const override = cache[role]?.[cap];
  if (typeof override === "boolean") return override;
  return DEFAULT_PERMS[role][cap];
}

export function permsForRole(role: Role): Record<Capability, boolean> {
  const base = DEFAULT_PERMS[role];
  const override = cache[role] ?? {};
  const out = { ...base };
  for (const k of Object.keys(override) as Capability[]) {
    const v = override[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function isRoleCustomized(role: Role): boolean {
  const override = cache[role];
  if (!override) return false;
  return (Object.keys(override) as Capability[]).some(
    (k) => override[k] !== DEFAULT_PERMS[role][k]
  );
}

// ── 変更操作（master のみ・楽観更新＋Supabase 書き込み）──

export async function setPerm(
  role: Role,
  cap: Capability,
  value: boolean
): Promise<void> {
  if (role === "master") return;
  const roleOverride = { ...(cache[role] ?? {}) };
  const isDefault = value === DEFAULT_PERMS[role][cap];

  // 楽観更新
  const next = { ...cache };
  if (isDefault) {
    delete roleOverride[cap];
  } else {
    roleOverride[cap] = value;
  }
  if (Object.keys(roleOverride).length === 0) delete next[role];
  else next[role] = roleOverride;
  cache = next;
  notify();

  // 永続化
  if (isDefault) {
    await db()
      .from("role_perm_overrides")
      .delete()
      .eq("role", role)
      .eq("capability", cap);
  } else {
    await db()
      .from("role_perm_overrides")
      .upsert({ role, capability: cap, allowed: value });
  }
}

export async function resetRole(role: Role): Promise<void> {
  const next = { ...cache };
  delete next[role];
  cache = next;
  notify();
  await db().from("role_perm_overrides").delete().eq("role", role);
}
