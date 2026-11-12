"use client";

// ─────────────────────────────────────────────────────────────
// 編集ロック（共同編集）
//
//  edit_locks テーブル + RPC（supabase/edit-locks.sql）のクライアント側。
//  年度の collab_enabled がオンの年度の文書だけ、編集開始でロックを取る。
//   - acquire : 空いていれば取得。他の人が編集中なら保持者名を返す
//   - refresh : 約30秒ごとに「編集中」を知らせる（90秒途絶えるとロックは失効）
//   - release : 保存して終了／画面を離れるときに手放す
//  他の人が編集中の文書への書き込みは、DB 側のトリガも拒否する（edit_locked）。
// ─────────────────────────────────────────────────────────────

import { db } from "./backend/client";
import { getAccessToken, getSupabaseEnv } from "./supabase";

export type LockType = "gian" | "jotei" | "budget" | "report";

export const LOCK_TTL_MS = 90_000;
export const HEARTBEAT_MS = 30_000;
/** 保存の書き込みが DB に届くのを待ってからロックを手放す（直後に取った人が古い内容を読まないため） */
const RELEASE_DELAY_MS = 1_500;

/** この画面（タブ）の id。同じ人でも別タブからは編集を開始できない。 */
export const SESSION_ID: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export type AcquireResult =
  | { ok: true }
  | { ok: false; holder?: string; own?: boolean; error?: string };

export interface EditLock {
  docType: LockType;
  docId: string;
  memberId: string;
  memberName: string;
  sessionId: string;
  acquiredAt: string;
  heartbeatAt: string;
}

type LockRow = {
  doc_type: LockType;
  doc_id: string;
  member_id: string;
  member_name: string;
  session_id: string;
  acquired_at: string;
  heartbeat_at: string;
};

function lockKey(type: LockType, id: string): string {
  return `${type}:${id}`;
}

// 手放す予定のタイマー（すぐ編集を再開したときは取り消す）
const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function acquireEditLock(
  type: LockType,
  id: string
): Promise<AcquireResult> {
  const timer = releaseTimers.get(lockKey(type, id));
  if (timer) {
    clearTimeout(timer);
    releaseTimers.delete(lockKey(type, id));
  }
  const { data, error } = await db().rpc("acquire_edit_lock", {
    p_type: type,
    p_id: id,
    p_session: SESSION_ID,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as {
    ok: boolean;
    holder?: string;
    own?: boolean;
    error?: string;
  };
  return r.ok ? { ok: true } : { ok: false, holder: r.holder, own: r.own, error: r.error };
}

/** 編集中であることを知らせる。ロックを失っていれば false、通信エラーなどは null。 */
export async function refreshEditLock(
  type: LockType,
  id: string
): Promise<boolean | null> {
  const { data, error } = await db().rpc("refresh_edit_lock", {
    p_type: type,
    p_id: id,
    p_session: SESSION_ID,
  });
  if (error) return null;
  return data === true;
}

/** 少し待ってからロックを手放す（直前の保存が DB に届くのを待つ） */
export function releaseEditLock(type: LockType, id: string): void {
  const k = lockKey(type, id);
  const prev = releaseTimers.get(k);
  if (prev) clearTimeout(prev);
  releaseTimers.set(
    k,
    setTimeout(() => {
      releaseTimers.delete(k);
      void Promise.resolve(
        db().rpc("release_edit_lock", {
          p_type: type,
          p_id: id,
          p_session: SESSION_ID,
        })
      ).catch(() => {});
    }, RELEASE_DELAY_MS)
  );
}

/** ページを閉じるとき用：キャンセルされにくい keepalive の fetch で手放す（失敗しても90秒で失効する） */
export async function releaseEditLockOnUnload(
  type: LockType,
  id: string
): Promise<void> {
  try {
    const env = getSupabaseEnv();
    const token = await getAccessToken();
    if (!env || !token) return;
    void fetch(`${env.url}/rest/v1/rpc/release_edit_lock`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: env.anon,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_type: type, p_id: id, p_session: SESSION_ID }),
    });
  } catch {
    /* 失効に任せる */
  }
}

export async function forceReleaseEditLock(
  type: LockType,
  id: string
): Promise<boolean> {
  const { error } = await db().rpc("force_release_edit_lock", {
    p_type: type,
    p_id: id,
  });
  return !error;
}

/** 失効していない（90秒以内に更新された）ロックだけ。 */
export function isLockFresh(lock: EditLock): boolean {
  return Date.now() - new Date(lock.heartbeatAt).getTime() < LOCK_TTL_MS;
}

export async function fetchEditLocks(): Promise<EditLock[]> {
  const { data, error } = await db().from("edit_locks").select("*");
  if (error) return [];
  return ((data ?? []) as LockRow[])
    .map((r) => ({
      docType: r.doc_type,
      docId: r.doc_id,
      memberId: r.member_id,
      memberName: r.member_name,
      sessionId: r.session_id,
      acquiredAt: r.acquired_at,
      heartbeatAt: r.heartbeat_at,
    }))
    .filter(isLockFresh);
}

export async function fetchEditLock(
  type: LockType,
  id: string
): Promise<EditLock | null> {
  const { data, error } = await db()
    .from("edit_locks")
    .select("*")
    .eq("doc_type", type)
    .eq("doc_id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as LockRow;
  const lock: EditLock = {
    docType: r.doc_type,
    docId: r.doc_id,
    memberId: r.member_id,
    memberName: r.member_name,
    sessionId: r.session_id,
    acquiredAt: r.acquired_at,
    heartbeatAt: r.heartbeat_at,
  };
  return isLockFresh(lock) ? lock : null;
}

// ── 書き込みを DB に拒否されたことの通知（各ストア → 編集モード）──
export interface WriteRejection {
  type: LockType;
  id: string;
  holder: string;
}
const rejectListeners = new Set<(r: WriteRejection) => void>();

export function onWriteRejected(fn: (r: WriteRejection) => void): () => void {
  rejectListeners.add(fn);
  return () => rejectListeners.delete(fn);
}

/** DB の編集ロック拒否（edit_locked）なら、通知して true を返す。 */
export function reportIfLockRejected(
  type: LockType,
  id: string,
  error: { message?: string } | null
): boolean {
  const msg = error?.message ?? "";
  if (!msg.startsWith("edit_locked")) return false;
  const holder = msg.split(":").slice(1).join(":").trim();
  rejectListeners.forEach((fn) => fn({ type, id, holder }));
  return true;
}
