"use client";

import { useEffect, useRef } from "react";

/**
 * 閲覧中の画面を、開き直したとき・一定時間ごとに最新の内容へ読み直す。
 * （他の人の保存が反映されず、古い内容が表示され続けるのを防ぐ）
 * reload が null のあいだは何もしない。
 */
export function useAutoRefresh(
  reload: (() => Promise<void>) | null,
  intervalMs = 60_000
): void {
  const ref = useRef(reload);
  ref.current = reload;
  const active = reload !== null;
  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      void ref.current?.().catch(() => {});
    };
    const t = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", run);
    };
  }, [active, intervalMs]);
}
