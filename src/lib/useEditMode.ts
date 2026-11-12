"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEARTBEAT_MS,
  LockType,
  SESSION_ID,
  acquireEditLock,
  fetchEditLock,
  onWriteRejected,
  refreshEditLock,
  releaseEditLock,
  releaseEditLockOnUnload,
} from "./editLockStore";
import { useAuthState } from "./useOrg";

export interface CollabOptions {
  type: LockType;
  /** ロックに使う文書 id（省略時は key） */
  id?: string;
  /** 年度の collab_enabled。オフの年度は、ロックなしの従来どおりの編集モード */
  enabled: boolean;
  /** 編集開始の直前に、最新の内容を DB から読み直す（他の人の変更を取り込む） */
  reload?: () => Promise<void>;
}

const HOLDER_POLL_MS = 15_000;
/** 通信エラーが続いて、ロックが失効したとみなすまでの回数（30秒 × 3 ≒ 90秒） */
const MAX_HEARTBEAT_ERRORS = 3;

/**
 * 編集モード。画面を開いた直後は閲覧状態で、「編集開始」を押すと編集できる。
 * 入力は編集中だけ受け付けるので、編集を始めない限り自動保存も走らない。
 * key（議案 id など）が変わると、編集モードは自動で解除される。
 *
 * collab.enabled の文書（共同編集がオンの年度）では、編集開始で編集ロックを取る。
 * 他の人が編集中なら開始できず（holder に保持者）、編集中は定期的に「編集中」を知らせる。
 */
export function useEditMode(
  key: string,
  collab?: CollabOptions
): {
  editing: boolean;
  start: () => void;
  stop: () => void;
  /** 編集開始の処理中（ロック取得・読み直し） */
  busy: boolean;
  /** 他の人（または別のタブ）が編集中ならその情報 */
  holder: { name: string; own: boolean } | null;
  /** 開始できなかった／編集権を失った理由 */
  message: string | null;
  dismissMessage: () => void;
} {
  const { userId } = useAuthState();
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [holder, setHolder] = useState<{ name: string; own: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const type = collab?.type;
  const lockId = collab?.id ?? key;
  const enabled = !!collab?.enabled && !!lockId;
  const editing = startedKey === key;

  const reloadRef = useRef(collab?.reload);
  reloadRef.current = collab?.reload;

  const reloadSafely = useCallback(async () => {
    try {
      await reloadRef.current?.();
    } catch {
      /* 読み直せなくても編集権の判断には影響しない */
    }
  }, []);

  const start = useCallback(() => {
    setMessage(null);
    if (!enabled || !type) {
      setStartedKey(key);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const r = await acquireEditLock(type, lockId);
        if (!r.ok) {
          setMessage(
            r.error === "forbidden"
              ? "編集の権限がありません。"
              : r.holder !== undefined
                ? r.own
                  ? "あなたが別のタブ（または端末）で編集中です。そちらで「保存して終了」してください。"
                  : `${r.holder || "他の人"}さんが編集中です。`
                : "編集を開始できませんでした。通信状況を確認して、もう一度お試しください。"
          );
          return;
        }
        // 他の人の変更を取り込んでから編集を始める（古い内容の上書きを防ぐ）
        await reloadSafely();
        setStartedKey(key);
      } finally {
        setBusy(false);
      }
    })();
  }, [enabled, type, lockId, key, reloadSafely]);

  const stop = useCallback(() => setStartedKey(null), []);
  const dismissMessage = useCallback(() => setMessage(null), []);

  // 編集中でないあいだ、他の人が編集中かを定期的に確認する
  useEffect(() => {
    if (!enabled || !type || editing) {
      setHolder(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      const lock = await fetchEditLock(type, lockId);
      if (!alive) return;
      setHolder(
        lock && lock.sessionId !== SESSION_ID
          ? { name: lock.memberName, own: lock.memberId === userId }
          : null
      );
    };
    void tick();
    const t = setInterval(() => void tick(), HOLDER_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, type, lockId, editing, userId]);

  // 編集中：定期的に知らせる。終了・画面を離れるときはロックを手放す
  useEffect(() => {
    if (!enabled || !type || !editing) return;
    let errors = 0;
    const t = setInterval(() => {
      void (async () => {
        const ok = await refreshEditLock(type, lockId);
        if (ok === false || (ok === null && ++errors >= MAX_HEARTBEAT_ERRORS)) {
          setStartedKey(null);
          setMessage(
            "編集権が失われたため、編集を終了しました（他の人が編集を始めたか、通信が途切れました）。最新の内容を読み込み直しました。"
          );
          await reloadSafely();
        } else if (ok === true) {
          errors = 0;
        }
      })();
    }, HEARTBEAT_MS);
    const onHide = () => void releaseEditLockOnUnload(type, lockId);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", onHide);
      releaseEditLock(type, lockId);
    };
  }, [enabled, type, lockId, editing, reloadSafely]);

  // DB に書き込みを拒否された（他の人が編集中）：最新の内容に戻す。編集中なら編集も終了する
  useEffect(() => {
    if (!enabled || !type) return;
    return onWriteRejected((r) => {
      if (r.type !== type || r.id !== lockId) return;
      const who = r.holder || "他の人";
      if (editing) {
        setStartedKey(null);
        setMessage(
          `${who}さんが編集中のため、保存できませんでした。編集を終了し、最新の内容を読み込み直しました。`
        );
      } else {
        setMessage(
          `${who}さんが編集中のため、操作を保存できませんでした。最新の内容を読み込み直しました。`
        );
      }
      void reloadSafely();
    });
  }, [enabled, type, lockId, editing, reloadSafely]);

  return { editing, start, stop, busy, holder, message, dismissMessage };
}

/** 「編集開始」ボタンの文言（他の人が編集中ならその旨） */
export function editStartLabel(e: {
  busy: boolean;
  holder: { name: string; own: boolean } | null;
}): string {
  if (e.holder) return e.holder.own ? "別のタブで編集中" : `${e.holder.name}さんが編集中`;
  if (e.busy) return "確認中…";
  return "編集開始";
}

export function editStartTitle(e: {
  holder: { name: string; own: boolean } | null;
}): string {
  return e.holder
    ? "編集中の人が「保存して終了」するか、しばらく操作がなくなると、編集を開始できます"
    : "編集を始めます（編集中の変更は自動で保存されます）";
}
