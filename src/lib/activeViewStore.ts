// ─────────────────────────────────────────────────────────────
// 「いま見ている年度・期間」ストア（画面上部の年度タブ／期間トグル）
//
// 要件定義書 3.10.2：年度タブで切り替えると、その年度における自分の
// 役職・権限・議案一覧・配信が切り替わる。
//
// roleOverride はプロトタイプのデモ専用（再ログインせずロール別表示を確認する）。
// ─────────────────────────────────────────────────────────────

import { Period, Role } from "./yearStore";

const LS_KEY = "yuhitsu.active-view.v3"; // v3: 年度 seed 変更に伴いキャッシュ更新

export interface ActiveView {
  yearId: string;
  period: Period;
  /** デモ用：実ロールを上書きして表示を確認する。null で実ロール */
  roleOverride: Role | null;
}

const DEFAULT_VIEW: ActiveView = {
  yearId: "",
  period: "live",
  roleOverride: null,
};

let cache: ActiveView | null = null;

function load(): ActiveView {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = DEFAULT_VIEW;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    cache = raw
      ? { ...DEFAULT_VIEW, ...(JSON.parse(raw) as ActiveView) }
      : DEFAULT_VIEW;
  } catch {
    cache = DEFAULT_VIEW;
  }
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: ActiveView): void {
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

export function getState(): ActiveView {
  return load();
}
export function getStateDefault(): ActiveView {
  return DEFAULT_VIEW;
}

export function setYear(yearId: string): void {
  commit({ ...load(), yearId });
}
export function setPeriod(period: Period): void {
  commit({ ...load(), period });
}
export function setRoleOverride(roleOverride: Role | null): void {
  commit({ ...load(), roleOverride });
}

export function resetActiveView(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit(DEFAULT_VIEW);
}
