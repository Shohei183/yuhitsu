"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useBudget } from "@/lib/useBudgetStore";
import { downloadDocHtml } from "@/lib/download";
import { useCan } from "@/lib/useOrg";
import BudgetDoc, { BudgetForm } from "./BudgetDoc";
import styles from "./BudgetView.module.css";

const TABS: { key: BudgetForm; label: string }[] = [
  { key: "form1", label: "様式1 収支予算書" },
  { key: "form2", label: "様式2 収益明細書" },
  { key: "form3", label: "様式3 費用明細書" },
];

export default function BudgetView({ budgetId }: { budgetId: string }) {
  const budget = useBudget(budgetId);
  const can = useCan();
  const docRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<BudgetForm>("form1");

  if (!budget) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p>予算書が見つかりません。</p>
          <Link href="/">← トップへ</Link>
        </div>
      </div>
    );
  }

  const backHref = budget.gianId ? `/gian/${budget.gianId}` : "/";

  const onDownload = () => {
    void downloadDocHtml(
      docRef.current,
      `事業収支予算書_${budget.title || "無題"}`,
      `事業収支予算書：${budget.title || "無題"}`
    ).catch((e) => console.error("[予算書] ダウンロード失敗:", e));
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={backHref} className={styles.navLink}>
          {budget.gianId ? "← 議案へ戻る" : "← トップへ"}
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
          PDF出力（A4・全様式）
        </button>
      </div>

      {/* 画面表示：様式タブで切り替え */}
      <div className={styles.screen}>
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <BudgetDoc budget={budget} only={tab} />
      </div>

      {/* 印刷・ダウンロード用：全様式（画面外／印刷時のみ表示） */}
      <div className={styles.exportSrc}>
        <div ref={docRef}>
          <BudgetDoc budget={budget} />
        </div>
      </div>
    </div>
  );
}
