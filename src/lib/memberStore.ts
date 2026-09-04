// ─────────────────────────────────────────────────────────────
// メンバー管理ストア（LOM 全体で 1 つ・年度に依存しない）
//
// 本番: Supabase `members` テーブル（auth.users と 1:1）。
//  - パスワードは Supabase Auth が管理（このストアは氏名・在籍・master 属性のみ）
//  - 発行＝招待メール（/api/members/invite）、在籍・master 変更＝/api/members/[id]
//  - 起動時に hydrate() が全件をキャッシュへ。以降は subscribe で購読。
// ─────────────────────────────────────────────────────────────

import { db, callApi } from "./backend/client";

export type MemberStatus = "active" | "retired";

export interface Member {
  id: string; // = auth.users.id (uuid)
  name: string; // full_name
  email: string;
  status: MemberStatus;
  isMaster: boolean;
  createdAt: string;
}

export type MemberStore = Record<string, Member>;

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_master: boolean;
  created_at: string;
};

function fromRow(r: Row): Member {
  return {
    id: r.id,
    name: r.full_name ?? "",
    email: r.email,
    status: r.status === "retired" ? "retired" : "active",
    isMaster: Boolean(r.is_master),
    createdAt: r.created_at,
  };
}

// ── キャッシュ ──
let cache: MemberStore = {};
let hydrated = false;
const EMPTY: MemberStore = {};
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

/** 起動時に Supabase から全メンバーを読み込む */
export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("members").select("*");
  if (error) {
    console.error("[memberStore] hydrate 失敗:", error.message);
    return;
  }
  const next: MemberStore = {};
  for (const r of (data ?? []) as Row[]) next[r.id] = fromRow(r);
  cache = next;
  hydrated = true;
  notify();
}

// ── 読み取り ──
export function getStore(): MemberStore {
  return cache;
}
export function getStoreDefault(): MemberStore {
  return EMPTY;
}
export function getMember(id: string): Member | undefined {
  return cache[id];
}
export function getMemberDefault(): Member | undefined {
  return undefined;
}
export function getMemberByEmail(email: string): Member | undefined {
  const q = email.trim().toLowerCase();
  return Object.values(cache).find((m) => m.email.toLowerCase() === q);
}

/** master を先頭に、その後は氏名順 */
export function listMembers(): Member[] {
  return Object.values(cache).sort((a, b) => {
    if (a.isMaster !== b.isMaster) return a.isMaster ? -1 : 1;
    return a.name.localeCompare(b.name, "ja");
  });
}

// ── 変更操作（master のみ・API route 経由）──

/** 招待メールを1通送る（hydrate はしない）。作成された auth ユーザー id を返す。 */
export async function inviteOne(input: {
  name: string;
  email: string;
}): Promise<{ ok: boolean; error?: string; userId?: string | null }> {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name || !email) return { ok: false, error: "氏名とメールを入力してください" };
  const res = await callApi<{ userId?: string | null }>(
    "/api/members/invite",
    { email, fullName: name }
  );
  return { ok: res.ok, error: res.error, userId: res.data?.userId ?? null };
}

/** アカウント発行＝招待メール送信（単発。送信後にメンバー一覧を再取得） */
export async function issueAccount(input: {
  name: string;
  email: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await inviteOne(input);
  if (res.ok) await hydrate();
  return { ok: res.ok, error: res.error };
}

/** 氏名の変更（master が編集） */
export async function updateMember(
  id: string,
  patch: { name?: string; email?: string }
): Promise<{ ok: boolean; error?: string }> {
  const res = await callApi(`/api/members/${id}`, {
    fullName: patch.name?.trim(),
    email: patch.email?.trim(),
  }, "PATCH");
  if (res.ok) await hydrate();
  return res;
}

export async function setMemberStatus(
  id: string,
  status: MemberStatus
): Promise<{ ok: boolean; error?: string }> {
  const res = await callApi(`/api/members/${id}`, { status }, "PATCH");
  if (res.ok) await hydrate();
  return res;
}

export async function setMemberMaster(
  id: string,
  isMaster: boolean
): Promise<{ ok: boolean; error?: string }> {
  const res = await callApi(`/api/members/${id}`, { isMaster }, "PATCH");
  if (res.ok) await hydrate();
  return res;
}
