"use client";

import { useEffect, useState } from "react";
import { EditLock, fetchEditLocks } from "./editLockStore";

const POLL_MS = 20_000;

/** いま編集中（90秒以内に更新された）の文書の一覧。enabled が false の間は取得しない。 */
export function useEditLocks(enabled: boolean): EditLock[] {
  const [locks, setLocks] = useState<EditLock[]>([]);
  useEffect(() => {
    if (!enabled) {
      setLocks([]);
      return;
    }
    let alive = true;
    const tick = async () => {
      const l = await fetchEditLocks();
      if (alive) setLocks(l);
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return locks;
}
