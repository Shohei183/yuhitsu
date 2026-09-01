// ─────────────────────────────────────────────────────────────
// ロール × 操作権限の上書きストア
//
// 既定値は permissions.ts の DEFAULT_PERMS。ここには「既定から変更した分」だけを
// 保存する（role → capability → boolean）。マスターは常に全許可・編集不可。
//
// プロトタイプ: localStorage のみ。
// ─────────────────────────────────────────────────────────────

import { Role } from "./yearStore";
import { Capability, DEFAULT_PERMS } from "./permissions";

const LS_KEY = "yuhitsu.role-perms.v2"; // v1→v2: ロール体系を JC 役職に変更

/** 既定からの上書き分のみ（未指定なら DEFAULT_PERMS を使う） */
export type RolePermOverrides = Partial<
  Record<Role, Partial<Record<Capability, boolean>>>
>;

const EMPTY: RolePermOverrides = {};

let cache: RolePermOverrides | null = null;

function load(): RolePermOverrides {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = EMPTY;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    cache = raw ? (JSON.parse(raw) as RolePermOverrides) : {};
  } catch {
    cache = {};
  }
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: RolePermOverrides): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): RolePermOverrides {
  return load();
}
export function getStoreDefault(): RolePermOverrides {
  return EMPTY;
}

/** 実効権限：master は常に全許可。それ以外は 上書き → 既定 の順で解決 */
export function can(role: Role, cap: Capability): boolean {
  if (role === "master") return true;
  const override = load()[role]?.[cap];
  if (typeof override === "boolean") return override;
  return DEFAULT_PERMS[role][cap];
}

export function permsForRole(role: Role): Record<Capability, boolean> {
  const base = DEFAULT_PERMS[role];
  const override = load()[role] ?? {};
  const out = { ...base };
  for (const k of Object.keys(override) as Capability[]) {
    const v = override[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** そのロールが既定から変更されているか */
export function isRoleCustomized(role: Role): boolean {
  const override = load()[role];
  if (!override) return false;
  return (Object.keys(override) as Capability[]).some(
    (k) => override[k] !== DEFAULT_PERMS[role][k]
  );
}

// ── 変更操作（マスターのみ。権限チェックは画面側）──

export function setPerm(role: Role, cap: Capability, value: boolean): void {
  if (role === "master") return;
  const store = load();
  const roleOverride = { ...(store[role] ?? {}) };
  if (value === DEFAULT_PERMS[role][cap]) {
    delete roleOverride[cap]; // 既定と同じなら上書きを消す
  } else {
    roleOverride[cap] = value;
  }
  const next = { ...store };
  if (Object.keys(roleOverride).length === 0) {
    delete next[role];
  } else {
    next[role] = roleOverride;
  }
  commit(next);
}

/** そのロールを既定に戻す */
export function resetRole(role: Role): void {
  const next = { ...load() };
  delete next[role];
  commit(next);
}

/** 動作確認用：すべて既定へ */
export function resetRolePermStore(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit({});
}
