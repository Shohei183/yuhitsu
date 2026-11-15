"use client";

// ─────────────────────────────────────────────────────────────
// 保存キュー
//
//  文書（議案・上程届・予算書・委員会報告）の DB 保存を、文書ごとに1件ずつ順番に行う。
//   - 入力のたびに保存が並行して飛び、古い内容があとから届いて新しい内容を上書きするのを防ぐ
//     （実行時点の最新の内容を書くので、連続した変更は自然にまとまる）
//   - 通信エラーなどで失敗したら自動でやり直す。失敗が続くときは画面に出す
//   - 保存が終わっていない文書があるか調べたり、終わるのを待ったりできる
//     （「保存して終了」「編集開始の前の読み直し」「画面を閉じるときの警告」で使う）
// ─────────────────────────────────────────────────────────────

export type SaveResult =
  | { kind: "ok" }
  /** 編集ロックで拒否された（利用者へは別経路で通知済み。やり直さない） */
  | { kind: "rejected" }
  /** 一時的な失敗（通信エラーなど）。自動でやり直す */
  | { kind: "retry"; message: string }
  /** やり直しても直らない失敗（権限なしなど） */
  | { kind: "fatal"; message: string };

/** DB のエラーを、やり直せるものとそうでないものに分ける */
export function dbErrorResult(error: {
  message?: string;
  code?: string;
}): SaveResult {
  const msg = error.message ?? "不明なエラー";
  const code = error.code ?? "";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return { kind: "fatal", message: "権限がないため保存できません" };
  }
  if (/^(22|23)/.test(code)) {
    return { kind: "fatal", message: `保存できない内容です（${msg}）` };
  }
  return { kind: "retry", message: msg };
}

interface Entry {
  task: () => Promise<SaveResult>;
  running: boolean;
  /** 実行中にさらに変更があった（終わったらもう一度、最新の内容で保存する） */
  dirty: boolean;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** 直近の失敗（null なら成功済み・未実行） */
  failed: string | null;
  /** 一時的な失敗を自動でやり直す途中か */
  retrying: boolean;
  waiters: Array<() => void>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

const MAX_ATTEMPTS = 8;
const backoff = (n: number) => Math.min(1500 * 2 ** (n - 1), 20_000);

export interface SaveStatus {
  /** 保存が終わっていない文書の数 */
  pending: number;
  /** 保存に失敗している場合の理由（なければ null） */
  failed: string | null;
}

let status: SaveStatus = { pending: 0, failed: null };

function isPending(e: Entry): boolean {
  return e.running || e.dirty || e.timer !== null;
}

function recompute() {
  let pending = 0;
  let failed: string | null = null;
  for (const e of entries.values()) {
    if (isPending(e)) pending++;
    if (e.failed && !failed) failed = e.failed;
  }
  if (pending !== status.pending || failed !== status.failed) {
    status = { pending, failed };
    listeners.forEach((fn) => fn());
  } else {
    // 状態は同じでも、待っている人（flush）の判定のために通知する
    listeners.forEach((fn) => fn());
  }
}

export function subscribeSaveStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getSaveStatus(): SaveStatus {
  return status;
}
const SERVER_STATUS: SaveStatus = { pending: 0, failed: null };
export function getSaveStatusServer(): SaveStatus {
  return SERVER_STATUS;
}

function settle(e: Entry) {
  const ws = e.waiters;
  e.waiters = [];
  ws.forEach((fn) => fn());
}

async function run(key: string, e: Entry): Promise<void> {
  if (e.running) return;
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  e.running = true;
  e.dirty = false;
  recompute();

  let result: SaveResult;
  try {
    result = await e.task();
  } catch (err) {
    result = {
      kind: "retry",
      message: err instanceof Error ? err.message : "通信エラー",
    };
  }
  e.running = false;

  if (result.kind === "ok" || result.kind === "rejected") {
    e.attempts = 0;
    e.failed = null;
    e.retrying = false;
    if (e.dirty) {
      void run(key, e);
      return;
    }
    entries.delete(key);
    recompute();
    settle(e);
    return;
  }

  if (result.kind === "fatal") {
    e.failed = result.message;
    e.retrying = false;
    e.attempts = 0;
    // 次の変更でもう一度試す（entries には残して、画面に失敗を出し続ける）
    recompute();
    settle(e);
    return;
  }

  // retry
  e.failed = result.message;
  e.attempts += 1;
  if (e.attempts >= MAX_ATTEMPTS) {
    // 自動のやり直しは打ち切り。画面の失敗表示と、次の変更・「今すぐ再試行」で再開する
    e.retrying = false;
    e.dirty = false;
    recompute();
    settle(e);
    return;
  }
  e.retrying = true;
  e.dirty = false;
  e.timer = setTimeout(() => {
    e.timer = null;
    void run(key, e);
  }, backoff(e.attempts));
  recompute();
}

/**
 * 保存を予約する。task は「実行する時点の最新の内容」を読んで書くこと。
 * 返す Promise は、この文書の保存が一段落（成功／打ち切り）したときに解決する。
 */
export function queueSave(
  key: string,
  task: () => Promise<SaveResult>
): Promise<void> {
  let e = entries.get(key);
  if (!e) {
    e = {
      task,
      running: false,
      dirty: false,
      attempts: 0,
      timer: null,
      failed: null,
      retrying: false,
      waiters: [],
    };
    entries.set(key, e);
  } else {
    e.task = task;
  }
  const done = new Promise<void>((resolve) => e!.waiters.push(resolve));
  if (e.running) {
    e.dirty = true;
    recompute();
  } else {
    // 前回の失敗の待ち時間中でも、新しい変更が来たらすぐ最新の内容で試す
    e.attempts = 0;
    void run(key, e);
  }
  return done;
}

/** この文書（省略時は全体）に、保存が終わっていないものがあるか */
export function hasPendingSaves(key?: string): boolean {
  if (key) {
    const e = entries.get(key);
    return !!e && (isPending(e) || !!e.failed);
  }
  for (const e of entries.values()) if (isPending(e) || e.failed) return true;
  return false;
}

/** 失敗しているものを、待たずにすぐやり直す */
export function retrySavesNow(): void {
  for (const [key, e] of entries) {
    if (e.running) continue;
    e.attempts = 0;
    void run(key, e);
  }
}

/**
 * 保存が終わるのを待つ。すべて成功したら true。
 * 時間切れ・失敗が残った場合は false。
 */
export function flushSaves(key?: string, timeoutMs = 10_000): Promise<boolean> {
  const idle = () => !hasPendingSaves(key);
  if (idle()) return Promise.resolve(true);
  // 失敗で止まっているものは、待つ前にもう一度試す
  for (const [k, e] of entries) {
    if (key && k !== key) continue;
    if (!e.running && e.failed) {
      e.attempts = 0;
      void run(k, e);
    }
  }
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsub();
      resolve(ok);
    };
    const unsub = subscribeSaveStatus(() => {
      if (idle()) finish(true);
      else if (!hasRunningOrWaiting(key)) finish(false);
    });
    const timer = setTimeout(() => finish(idle()), timeoutMs);
  });
}

function hasRunningOrWaiting(key?: string): boolean {
  for (const [k, e] of entries) {
    if (key && k !== key) continue;
    if (e.running || e.dirty || e.timer !== null) return true;
  }
  return false;
}
