"use client";

import { useEffect, useState } from "react";
import { useAuthState } from "@/lib/useOrg";
import { hydrateAll } from "@/lib/backend/hydrate";
import { listYears, subscribe as subscribeYears } from "@/lib/yearStore";
import { getState as getActiveView, setYear } from "@/lib/activeViewStore";
import styles from "./AppFrame.module.css";

/**
 * ログイン済みユーザー向けに、Supabase から全ストアをハイドレートしてから
 * 子を描画する。ハイドレート中はローディング表示。
 */
export default function DataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = useAuthState();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    hydrateAll()
      .then(() => {
        if (cancelled) return;
        // アクティブ年度が未設定／不正なら先頭の年度に合わせる
        const years = listYears();
        const av = getActiveView();
        if (!years.some((y) => y.id === av.yearId) && years[0]) {
          setYear(years[0].id);
        }
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 年度がまだ無い場合、追加されたら自動追従
  useEffect(() => {
    return subscribeYears(() => {
      const years = listYears();
      const av = getActiveView();
      if (!years.some((y) => y.id === av.yearId) && years[0]) {
        setYear(years[0].id);
      }
    });
  }, []);

  if (error) {
    return (
      <div className={styles.gate}>
        <p>データの読み込みに失敗しました。</p>
        <p style={{ fontSize: 13, color: "#888" }}>{error}</p>
        <button type="button" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.gate} aria-live="polite">
        <p>読み込み中…</p>
      </div>
    );
  }

  return <>{children}</>;
}
