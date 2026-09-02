"use client";

// 事業収支予算書の読み取り表示（閲覧・印刷・ダウンロード共用）
// 様式1（収支予算書）＋ 様式2・3（収益費用明細書）

import {
  BudgetDoc as TBudgetDoc,
  BudgetCategory,
  categoryTotal,
  sectionTotal,
  balance,
} from "@/lib/budgetStore";
import { jpNum } from "@/lib/format";
import { openFileByIdAsync } from "@/lib/backend/files";
import styles from "./BudgetDoc.module.css";

function yen(n: number): string {
  return `¥${jpNum(n)}`;
}
function amountOf(s: string): number {
  const n = Number(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 様式1：科目ごとに1行（予算額＝明細合計） */
function Form1Section({ label, cats }: { label: string; cats: BudgetCategory[] }) {
  return (
    <>
      <tr className={styles.sectionRow}>
        <td colSpan={3}>{label}</td>
      </tr>
      {cats.map((c, i) => (
        <tr key={c.name}>
          <td className={styles.catName}>
            {i + 1}. {c.name}
          </td>
          <td className={styles.amount}>{yen(categoryTotal(c))}</td>
          <td className={styles.note}>
            {c.items
              .map((it) => it.subItem || it.note)
              .filter(Boolean)
              .join("、")}
          </td>
        </tr>
      ))}
    </>
  );
}

export default function BudgetDoc({ budget }: { budget: TBudgetDoc }) {
  const rev = sectionTotal(budget.revenue);
  const exp = sectionTotal(budget.expense);
  const bal = balance(budget);

  return (
    <article className={styles.doc}>
      <header className={styles.head}>
        <div className={styles.lom}>{budget.lomName}</div>
        <h1 className={styles.title}>事業収支予算書</h1>
        {budget.title && <div className={styles.subject}>{budget.title}</div>}
        <div className={styles.unit}>（単位：円）</div>
      </header>

      <h2 className={styles.h2}>［様式1］収支予算書</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colCat}>科目</th>
            <th className={styles.colAmt}>予算額</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          <Form1Section label="（収益の部）" cats={budget.revenue} />
          <tr className={styles.totalRow}>
            <td>収益計</td>
            <td className={styles.amount}>{yen(rev)}</td>
            <td />
          </tr>
          <Form1Section label="（費用の部）" cats={budget.expense} />
          <tr className={styles.totalRow}>
            <td>費用計</td>
            <td className={styles.amount}>{yen(exp)}</td>
            <td />
          </tr>
          <tr className={styles.balanceRow}>
            <td>収支差額</td>
            <td className={styles.amount}>{yen(bal)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <h2 className={styles.h2}>［様式2］収益明細書</h2>
      <BudgetDetail cats={budget.revenue} />

      <h2 className={styles.h2}>［様式3］費用明細書</h2>
      <BudgetDetail cats={budget.expense} withAttachments />
    </article>
  );
}

function BudgetDetail({
  cats,
  withAttachments,
}: {
  cats: BudgetCategory[];
  withAttachments?: boolean;
}) {
  const used = cats.filter((c) => c.items.length > 0);

  // 添付のある行に通し番号
  const attachNo = new Map<string, number>();
  if (withAttachments) {
    let n = 0;
    for (const c of used)
      for (const it of c.items) if (it.attachmentId) attachNo.set(it.id, ++n);
  }

  if (used.length === 0) return <p className={styles.empty}>（明細なし）</p>;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colCat}>科目</th>
          <th className={styles.colSub}>細目</th>
          <th>摘要（算出根拠）</th>
          <th className={styles.colAmt}>金額</th>
          {withAttachments && <th className={styles.colNo}>資料</th>}
        </tr>
      </thead>
      <tbody>
        {used.map((c) => (
          <DetailRows
            key={c.name}
            cat={c}
            withAttachments={!!withAttachments}
            attachNo={attachNo}
          />
        ))}
      </tbody>
    </table>
  );
}

function DetailRows({
  cat,
  withAttachments,
  attachNo,
}: {
  cat: BudgetCategory;
  withAttachments: boolean;
  attachNo: Map<string, number>;
}) {
  return (
    <>
      {cat.items.map((it, idx) => (
        <tr key={it.id}>
          {idx === 0 && (
            <td rowSpan={cat.items.length + 1} className={styles.catName}>
              {cat.name}
            </td>
          )}
          <td>{it.subItem || "—"}</td>
          <td className={styles.note}>{it.note || "—"}</td>
          <td className={styles.amount}>{yen(amountOf(it.amount))}</td>
          {withAttachments && (
            <td className={styles.noCell}>
              {it.attachmentId ? (
                <button
                  type="button"
                  className={styles.attachLink}
                  title={it.attachmentName ?? "資料を開く"}
                  onClick={() =>
                    openFileByIdAsync(
                      it.attachmentId!,
                      it.attachmentName ?? "資料"
                    )
                  }
                >
                  {attachNo.get(it.id)}
                </button>
              ) : (
                ""
              )}
            </td>
          )}
        </tr>
      ))}
      <tr className={styles.subtotalRow}>
        <td colSpan={2}>小計</td>
        <td className={styles.amount}>{yen(categoryTotal(cat))}</td>
        {withAttachments && <td />}
      </tr>
    </>
  );
}
