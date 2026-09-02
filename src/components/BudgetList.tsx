"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBudgetStore } from "@/lib/useBudgetStore";
import {
  createBudget,
  listBudgetsForYear,
  sectionTotal,
  balance,
} from "@/lib/budgetStore";
import { useActiveView, useActiveYear, useCan } from "@/lib/useOrg";
import { jpNum } from "@/lib/format";
import styles from "./BudgetList.module.css";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function BudgetList() {
  useBudgetStore();
  const { yearId } = useActiveView();
  const year = useActiveYear();
  const can = useCan();
  const router = useRouter();

  const budgets = listBudgetsForYear(yearId);

  const onCreate = () => {
    const id = createBudget({ yearId });
    router.push(`/budget/${id}`);
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year?.label ?? yearId} ／ 事業収支予算書
        </div>
        <h1 className={styles.title}>事業収支予算書</h1>
        <p className={styles.note}>
          事業ごとの収支予算書（様式1）と収益・費用明細書（様式2・3）を作成します。
          議案と独立して管理でき、議案構築画面から紐づけることもできます。
        </p>
      </div>

      {can.editGian && (
        <button type="button" className={styles.createBtn} onClick={onCreate}>
          ＋ 新規作成
        </button>
      )}

      {budgets.length === 0 ? (
        <p className={styles.empty}>まだ予算書がありません。</p>
      ) : (
        <ul className={styles.list}>
          {budgets.map((b) => {
            const rev = sectionTotal(b.revenue);
            const exp = sectionTotal(b.expense);
            return (
              <li key={b.id} className={styles.item}>
                <Link href={`/budget/${b.id}`} className={styles.card}>
                  <div className={styles.cardTitle}>
                    {b.title || "（無題の予算書）"}
                  </div>
                  <div className={styles.cardMeta}>
                    収益 ¥{jpNum(rev)} ／ 費用 ¥{jpNum(exp)} ／ 差額 ¥
                    {jpNum(balance(b))}
                  </div>
                  <div className={styles.cardSub}>
                    更新 {fmt(b.updatedAt)}
                    {b.gianId && "　・議案紐づけあり"}
                  </div>
                </Link>
                <Link href={`/budget/${b.id}/view`} className={styles.viewLink}>
                  閲覧
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/" className={styles.back}>
        ← トップへ
      </Link>
    </main>
  );
}
