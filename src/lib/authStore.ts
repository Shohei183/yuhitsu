// ─────────────────────────────────────────────────────────────
// 認証（ログインセッション）ストア
//
// 要件定義書 3.12：メール＋パスワード認証。パスワードを忘れた場合は
// メール経由のリセットリンク。
//
// プロトタイプ: localStorage のみ。実際のメール送信・トークン検証は行わず、
// 「送信しました」表示と、その場での新パスワード設定（ダミー）に留める。
// ─────────────────────────────────────────────────────────────

import {
  getMemberByEmail,
  setPassword,
  subscribe as subscribeMembers,
} from "./memberStore";
import { setRoleOverride } from "./activeViewStore";

const LS_KEY = "yuhitsu.auth.v1";

export interface AuthState {
  currentMemberId: string | null;
  /** 直近でリセットメール（ダミー）を送った宛先。画面表示用 */
  resetSentTo: string | null;
}

const EMPTY: AuthState = { currentMemberId: null, resetSentTo: null };

let cache: AuthState | null = null;

function load(): AuthState {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = EMPTY;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as AuthState) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: AuthState): void {
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
  const unsubMembers = subscribeMembers(fn); // メンバーの退会等でも再評価
  return () => {
    listeners.delete(fn);
    unsubMembers();
  };
}

export function getState(): AuthState {
  return load();
}
export function getStateDefault(): AuthState {
  return EMPTY;
}

// ── 操作 ──

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export function login(email: string, password: string): LoginResult {
  const member = getMemberByEmail(email);
  if (!member) {
    return { ok: false, error: "メールアドレスが見つかりません" };
  }
  if (member.status === "retired") {
    return { ok: false, error: "このアカウントは退会済みです" };
  }
  if (member.password !== password) {
    return { ok: false, error: "パスワードが違います" };
  }
  commit({ currentMemberId: member.id, resetSentTo: null });
  setRoleOverride(null); // デモ用ロール上書きはログインごとにリセット
  return { ok: true };
}

export function logout(): void {
  commit({ currentMemberId: null, resetSentTo: null });
  setRoleOverride(null);
}

/** パスワードリセットメール送信（ダミー：宛先を控えるだけ） */
export function sendPasswordReset(email: string): LoginResult {
  const member = getMemberByEmail(email);
  // 実運用ではアカウントの有無を伏せるが、プロトタイプなので分かりやすさ優先
  if (!member) {
    return { ok: false, error: "メールアドレスが見つかりません" };
  }
  commit({ ...load(), resetSentTo: member.email });
  return { ok: true };
}

/** 新パスワードを設定（ダミー：トークン検証なし） */
export function resetPassword(email: string, newPassword: string): LoginResult {
  const member = getMemberByEmail(email);
  if (!member) return { ok: false, error: "メールアドレスが見つかりません" };
  if (!newPassword) return { ok: false, error: "新しいパスワードを入力してください" };
  setPassword(member.id, newPassword);
  commit({ ...load(), resetSentTo: null });
  return { ok: true };
}

/** 動作確認用：ログアウト状態へ */
export function resetAuthStore(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit(EMPTY);
}
