// ─────────────────────────────────────────────────────────────
// 通知（差し替え申請）の既読／クリア状態
//
// 差し替え申請そのものは gianStore の ReplacementRequest。
// ここでは「このブラウザでクリア済みの申請 id」だけを持つ。
// ─────────────────────────────────────────────────────────────

const LS_KEY = "yuhitsu.notif-dismissed.v1";

let cache: string[] | null = null;

function load(): string[] {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = [];
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    cache = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: string[]): void {
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

export function getDismissed(): string[] {
  return load();
}
export function getDismissedDefault(): string[] {
  return [];
}

export function isDismissed(id: string): boolean {
  return load().includes(id);
}

export function dismiss(...ids: string[]): void {
  const set = new Set(load());
  ids.forEach((id) => set.add(id));
  commit([...set]);
}

export function resetNotifications(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit([]);
}
