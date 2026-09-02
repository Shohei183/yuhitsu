"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBudget } from "@/lib/useBudgetStore";
import {
  BudgetCategory,
  BudgetDoc,
  blankLineItem,
  saveBudget,
  deleteBudget,
  categoryTotal,
  sectionTotal,
  balance,
} from "@/lib/budgetStore";
import { useCan } from "@/lib/useOrg";
import { jpNum } from "@/lib/format";
import { downloadDocHtml } from "@/lib/download";
import BudgetDocView from "./BudgetDoc";
import styles from "./BudgetEditor.module.css";

function yen(n: number): string {
  return `¥${jpNum(n)}`;
}

export default function BudgetEditor({ budgetId }: { budgetId: string }) {
  const budget = useBudget(budgetId);
  const can = useCan();
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);

  if (!budget) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>予算書が見つかりません。</p>
          <Link href="/budget">← 予算書一覧へ</Link>
        </div>
      </div>
    );
  }

  const readOnly = !can.editGian;
  const update = (next: BudgetDoc) => saveBudget(budgetId, next);

  const setField = (patch: Partial<BudgetDoc>) => update({ ...budget, ...patch });

  const mutateCat = (
    section: "revenue" | "expense",
    catName: string,
    fn: (c: BudgetCategory) => BudgetCategory
  ) => {
    update({
      ...budget,
      [section]: budget[section].map((c) =>
        c.name === catName ? fn(c) : c
      ),
    });
  };

  const rev = sectionTotal(budget.revenue);
  const exp = sectionTotal(budget.expense);
  const bal = balance(budget);

  const onDownload = () =>
    downloadDocHtml(
      previewRef.current,
      `事業収支予算書_${budget.title || "無題"}`,
      `事業収支予算書：${budget.title || "無題"}`
    );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/budget" className={styles.navLink}>
          ← 予算書一覧
        </Link>
        <Link href={`/budget/${budgetId}/view`} className={styles.navLink}>
          閲覧・印刷 →
        </Link>
        {budget.gianId && (
          <Link href={`/gian/${budget.gianId}`} className={styles.navLink}>
            紐づく議案へ →
          </Link>
        )}
        <button type="button" className={styles.dlBtn} onClick={onDownload}>
          ダウンロード
        </button>
        {!readOnly && (
          <button
            type="button"
            className={styles.delBtn}
            onClick={() => {
              if (confirm("この予算書を削除します。よろしいですか？")) {
                deleteBudget(budgetId);
                router.push("/budget");
              }
            }}
          >
            削除
          </button>
        )}
      </div>

      <div className={styles.card}>
        <label className={styles.titleLabel}>
          事業名
          <input
            className={styles.titleInput}
            value={budget.title}
            readOnly={readOnly}
            placeholder="例：4月度例会"
            onChange={(e) => setField({ title: e.target.value })}
          />
        </label>

        {/* 様式1：自動集計サマリー */}
        <h2 className={styles.h2}>［様式1］収支予算書（自動集計）</h2>
        <table className={styles.summary}>
          <thead>
            <tr>
              <th>科目</th>
              <th className={styles.amtCol}>予算額</th>
            </tr>
          </thead>
          <tbody>
            <tr className={styles.secRow}>
              <td colSpan={2}>（収益の部）</td>
            </tr>
            {budget.revenue.map((c, i) => (
              <tr key={c.name}>
                <td>
                  {i + 1}. {c.name}
                </td>
                <td className={styles.amt}>{yen(categoryTotal(c))}</td>
              </tr>
            ))}
            <tr className={styles.totRow}>
              <td>収益計</td>
              <td className={styles.amt}>{yen(rev)}</td>
            </tr>
            <tr className={styles.secRow}>
              <td colSpan={2}>（費用の部）</td>
            </tr>
            {budget.expense.map((c, i) => (
              <tr key={c.name}>
                <td>
                  {i + 1}. {c.name}
                </td>
                <td className={styles.amt}>{yen(categoryTotal(c))}</td>
              </tr>
            ))}
            <tr className={styles.totRow}>
              <td>費用計</td>
              <td className={styles.amt}>{yen(exp)}</td>
            </tr>
            <tr className={styles.balRow}>
              <td>収支差額</td>
              <td className={styles.amt}>{yen(bal)}</td>
            </tr>
          </tbody>
        </table>

        {/* 様式2・3：明細入力 */}
        <h2 className={styles.h2}>［様式2・3］収益・費用明細書（ここに入力）</h2>
        <p className={styles.hint}>
          各科目に明細行を追加します。上の様式1の予算額は明細の合計が自動反映されます。
        </p>

        <CategoryGroup
          heading="収益明細書"
          cats={budget.revenue}
          readOnly={readOnly}
          onMutate={(name, fn) => mutateCat("revenue", name, fn)}
        />
        <CategoryGroup
          heading="費用明細書"
          cats={budget.expense}
          readOnly={readOnly}
          onMutate={(name, fn) => mutateCat("expense", name, fn)}
        />
      </div>

      {/* ダウンロード用の隠しプレビュー（画面には出さないが DOM には置く） */}
      <div style={{ display: "none" }} aria-hidden>
        <div ref={previewRef}>
          <BudgetDocView budget={budget} />
        </div>
      </div>
    </div>
  );
}

function CategoryGroup({
  heading,
  cats,
  readOnly,
  onMutate,
}: {
  heading: string;
  cats: BudgetCategory[];
  readOnly: boolean;
  onMutate: (name: string, fn: (c: BudgetCategory) => BudgetCategory) => void;
}) {
  return (
    <div className={styles.group}>
      <h3 className={styles.h3}>{heading}</h3>
      {cats.map((c) => (
        <div key={c.name} className={styles.cat}>
          <div className={styles.catHead}>
            <span className={styles.catName}>{c.name}</span>
            <span className={styles.catTotal}>
              小計 {yen(categoryTotal(c))}
            </span>
          </div>
          {c.items.length > 0 && (
            <table className={styles.itemTable}>
              <thead>
                <tr>
                  <th className={styles.subCol}>細目</th>
                  <th>摘要（算出根拠）</th>
                  <th className={styles.amtCol}>金額</th>
                  <th className={styles.xCol} />
                </tr>
              </thead>
              <tbody>
                {c.items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <input
                        value={it.subItem}
                        readOnly={readOnly}
                        onChange={(e) =>
                          onMutate(c.name, (cat) => ({
                            ...cat,
                            items: cat.items.map((x) =>
                              x.id === it.id
                                ? { ...x, subItem: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={it.note}
                        readOnly={readOnly}
                        onChange={(e) =>
                          onMutate(c.name, (cat) => ({
                            ...cat,
                            items: cat.items.map((x) =>
                              x.id === it.id ? { ...x, note: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className={styles.amtInput}
                        inputMode="numeric"
                        value={it.amount}
                        readOnly={readOnly}
                        onChange={(e) =>
                          onMutate(c.name, (cat) => ({
                            ...cat,
                            items: cat.items.map((x) =>
                              x.id === it.id
                                ? { ...x, amount: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      {!readOnly && (
                        <button
                          type="button"
                          className={styles.xBtn}
                          onClick={() =>
                            onMutate(c.name, (cat) => ({
                              ...cat,
                              items: cat.items.filter((x) => x.id !== it.id),
                            }))
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!readOnly && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() =>
                onMutate(c.name, (cat) => ({
                  ...cat,
                  items: [...cat.items, blankLineItem()],
                }))
              }
            >
              ＋ 明細行を追加
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
