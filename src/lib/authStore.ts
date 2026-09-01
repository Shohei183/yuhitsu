"use client";

// ─────────────────────────────────────────────────────────────
// 認証ストア（Supabase Auth ラッパー）
//
// セッションは Supabase Auth SDK が localStorage で保持。ここでは
// useSyncExternalStore 用の同期スナップショットと、ログイン/ログアウト/
// パスワード操作の入口を提供する。
// ─────────────────────────────────────────────────────────────

import { getSupabase } from "./supabase";

export interface AuthState {
  /** ログイン中ユーザーの id（= auth.users.id / members.id）。未ログインは null */
  userId: string | null;
  email: string | null;
  /** onAuthStateChange を最低1回受け取ったか（初期化完了フラグ） */
  ready: boolean;
}

const EMPTY: AuthState = { userId: null, email: null, ready: false };
let snapshot: AuthState = EMPTY;

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

function setSnapshot(next: AuthState) {
  // 参照が変わらないと useSyncExternalStore が更新に気付かないので必ず新オブジェクト
  snapshot = next;
  notify();
}

let initialized = false;
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const sb = getSupabase();
  sb.auth.getSession().then(({ data }) => {
    const s = data.session;
    setSnapshot({
      userId: s?.user.id ?? null,
      email: s?.user.email ?? null,
      ready: true,
    });
  });
  sb.auth.onAuthStateChange((_event, session) => {
    setSnapshot({
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      ready: true,
    });
  });
}

export function subscribe(fn: () => void): () => void {
  ensureInit();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): AuthState {
  ensureInit();
  return snapshot;
}
export function getStateDefault(): AuthState {
  return EMPTY;
}

// ── 操作 ──

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    const msg = /invalid login credentials/i.test(error.message)
      ? "メールアドレスまたはパスワードが違います"
      : error.message;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  await getSupabase().auth.signOut();
}

/** パスワードリセットのメールを送る */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const redirectTo =
    (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "") +
    "/login/set-password";
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 招待リンク／リセットリンクで戻ってきた後に新パスワードを設定 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "パスワードは8文字以上にしてください" };
  }
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
