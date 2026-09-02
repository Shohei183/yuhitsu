"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBudget } from "@/lib/useBudgetStore";
import {
  BudgetCategory,
  BudgetDoc,
  BudgetLineItem,
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
import { uploadFile, deleteFileObj, openFileByIdAsync } from "@/lib/backend/files";
import BudgetDocView from "./BudgetDoc";
import styles from "./BudgetEditor.module.css";

function yen(n: number): string {
  return `¥${jpNum(n)}`;
}

type Tab = "form1" | "form2" | "form3";
const TABS: { key: Tab; label: string }[] = [
  { key: "form1", label: "様式1 収支予算書" },
  { key: "form2", label: "様式2 収益明細書" },
  { key: "form3", label: "様式3 費用明細書" },
];

export default function BudgetEditor({ budgetId }: { budgetId: string }) {
  const budget = useBudget(budgetId);
  const can = useCan();
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("form1");

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
      [section]: budget[section].map((c) => (c.name === catName ? fn(c) : c)),
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

        {tab === "form1" && (
          <Form1Summary
            revenue={budget.revenue}
            expense={budget.expense}
            rev={rev}
            exp={exp}
            bal={bal}
          />
        )}

        {tab === "form2" && (
          <CategoryGroup
            heading="収益明細書"
            budgetId={budgetId}
            cats={budget.revenue}
            readOnly={readOnly}
            onMutate={(name, fn) => mutateCat("revenue", name, fn)}
          />
        )}

        {tab === "form3" && (
          <CategoryGroup
            heading="費用明細書"
            budgetId={budgetId}
            cats={budget.expense}
            readOnly={readOnly}
            onMutate={(name, fn) => mutateCat("expense", name, fn)}
            showAttachments
          />
        )}
      </div>

      {/* ダウンロード用の隠しプレビュー */}
      <div style={{ display: "none" }} aria-hidden>
        <div ref={previewRef}>
          <BudgetDocView budget={budget} />
        </div>
      </div>
    </div>
  );
}

function Form1Summary({
  revenue,
  expense,
  rev,
  exp,
  bal,
}: {
  revenue: BudgetCategory[];
  expense: BudgetCategory[];
  rev: number;
  exp: number;
  bal: number;
}) {
  return (
    <>
      <p className={styles.hint}>
        各科目の予算額は、様式2・3の明細合計が自動反映されます（このタブは編集不可）。
      </p>
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
          {revenue.map((c, i) => (
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
          {expense.map((c, i) => (
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
    </>
  );
}

function CategoryGroup({
  heading,
  budgetId,
  cats,
  readOnly,
  onMutate,
  showAttachments,
}: {
  heading: string;
  budgetId: string;
  cats: BudgetCategory[];
  readOnly: boolean;
  onMutate: (name: string, fn: (c: BudgetCategory) => BudgetCategory) => void;
  showAttachments?: boolean;
}) {
  // 添付のある明細行に通し番号を振る（サンプル H 列の「1」「5」のような表示）
  const attachNo = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const c of cats)
      for (const it of c.items)
        if (it.attachmentId) map.set(it.id, ++n);
    return map;
  }, [cats]);

  return (
    <div className={styles.group}>
      <h3 className={styles.h3}>{heading}</h3>
      {showAttachments && (
        <p className={styles.hint}>
          見積書などは各明細行の右端「資料」から添付できます。
        </p>
      )}
      {cats.map((c) => (
        <div key={c.name} className={styles.cat}>
          <div className={styles.catHead}>
            <span className={styles.catName}>{c.name}</span>
            <span className={styles.catTotal}>小計 {yen(categoryTotal(c))}</span>
          </div>
          {c.items.length > 0 && (
            <table className={styles.itemTable}>
              <thead>
                <tr>
                  <th className={styles.subCol}>細目</th>
                  <th>摘要（算出根拠）</th>
                  <th className={styles.amtCol}>金額</th>
                  {showAttachments && <th className={styles.atCol}>資料</th>}
                  <th className={styles.xCol} />
                </tr>
              </thead>
              <tbody>
                {c.items.map((it) => (
                  <ItemRow
                    key={it.id}
                    budgetId={budgetId}
                    catName={c.name}
                    item={it}
                    readOnly={readOnly}
                    onMutate={onMutate}
                    showAttachment={!!showAttachments}
                    attachNo={attachNo.get(it.id)}
                  />
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

function ItemRow({
  budgetId,
  catName,
  item,
  readOnly,
  onMutate,
  showAttachment,
  attachNo,
}: {
  budgetId: string;
  catName: string;
  item: BudgetLineItem;
  readOnly: boolean;
  onMutate: (name: string, fn: (c: BudgetCategory) => BudgetCategory) => void;
  showAttachment: boolean;
  attachNo?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const patchItem = (patch: Partial<BudgetLineItem>) =>
    onMutate(catName, (cat) => ({
      ...cat,
      items: cat.items.map((x) => (x.id === item.id ? { ...x, ...patch } : x)),
    }));

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const obj = await uploadFile("budget", budgetId, file);
      patchItem({ attachmentId: obj.id, attachmentName: obj.name });
    } catch (e) {
      alert(e instanceof Error ? e.message : "添付に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async () => {
    if (item.attachmentId) {
      const id = item.attachmentId;
      patchItem({ attachmentId: null, attachmentName: null });
      await deleteFileObj(id);
    }
  };

  return (
    <tr>
      <td>
        <input
          value={item.subItem}
          readOnly={readOnly}
          onChange={(e) => patchItem({ subItem: e.target.value })}
        />
      </td>
      <td>
        <input
          value={item.note}
          readOnly={readOnly}
          onChange={(e) => patchItem({ note: e.target.value })}
        />
      </td>
      <td>
        <input
          className={styles.amtInput}
          inputMode="numeric"
          value={item.amount}
          readOnly={readOnly}
          onChange={(e) => patchItem({ amount: e.target.value })}
        />
      </td>
      {showAttachment && (
        <td className={styles.atCell}>
          {item.attachmentId ? (
            <span className={styles.attach}>
              <button
                type="button"
                className={styles.attachLink}
                title={item.attachmentName ?? "資料を開く"}
                onClick={() =>
                  openFileByIdAsync(
                    item.attachmentId!,
                    item.attachmentName ?? "資料"
                  )
                }
              >
                {attachNo ?? "📎"}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className={styles.attachX}
                  title="添付を外す"
                  onClick={removeAttachment}
                >
                  ×
                </button>
              )}
            </span>
          ) : (
            !readOnly && (
              <>
                <button
                  type="button"
                  className={styles.attachAdd}
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {busy ? "…" : "＋"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    onPickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </>
            )
          )}
        </td>
      )}
      <td>
        {!readOnly && (
          <button
            type="button"
            className={styles.xBtn}
            onClick={() =>
              onMutate(catName, (cat) => ({
                ...cat,
                items: cat.items.filter((x) => x.id !== item.id),
              }))
            }
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}
