"use client";

import { useRef } from "react";
import Link from "next/link";
import { useBudget } from "@/lib/useBudgetStore";
import { downloadDocHtml } from "@/lib/download";
import { useCan } from "@/lib/useOrg";
import BudgetDoc from "./BudgetDoc";
import styles from "./BudgetView.module.css";

export default function BudgetView({ budgetId }: { budgetId: string }) {
  const budget = useBudget(budgetId);
  const can = useCan();
  const docRef = useRef<HTMLDivElement>(null);

  if (!budget) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p>予算書が見つかりません。</p>
          <Link href="/budget">← 予算書一覧へ</Link>
        </div>
      </div>
    );
  }

  const onDownload = () =>
    downloadDocHtml(
      docRef.current,
      `事業収支予算書_${budget.title || "無題"}`,
      `事業収支予算書：${budget.title || "無題"}`
    );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/budget" className={styles.navLink}>
          ← 予算書一覧
        </Link>
        {can.editGian && (
          <Link href={`/budget/${budgetId}`} className={styles.navLink}>
            編集画面へ →
          </Link>
        )}
        <button type="button" className={styles.dlBtn} onClick={onDownload}>
          ダウンロード
        </button>
        <button
          type="button"
          className={styles.pdfBtn}
          onClick={() => window.print()}
        >
          PDF出力（A4）
        </button>
      </div>

      <div ref={docRef}>
        <BudgetDoc budget={budget} />
      </div>
    </div>
  );
}
