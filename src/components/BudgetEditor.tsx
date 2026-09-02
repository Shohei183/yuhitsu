"use client";

import { useRef, useState } from "react";
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
  attachmentOf,
  addOrReuseAttachment,
  pruneAttachments,
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
            budget={budget}
            section="revenue"
            update={update}
            readOnly={readOnly}
          />
        )}

        {tab === "form3" && (
          <div className={styles.form3Layout}>
            <div className={styles.form3Main}>
              <CategoryGroup
                heading="費用明細書"
                budget={budget}
                section="expense"
                update={update}
                readOnly={readOnly}
                showAttachments
              />
            </div>
            <AttachmentPanel
              budget={budget}
              update={update}
              readOnly={readOnly}
            />
          </div>
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
  budget,
  section,
  update,
  readOnly,
  showAttachments,
}: {
  heading: string;
  budget: BudgetDoc;
  section: "revenue" | "expense";
  update: (b: BudgetDoc) => void;
  readOnly: boolean;
  showAttachments?: boolean;
}) {
  const cats = budget[section];

  const mutateCat = (
    catName: string,
    fn: (c: BudgetCategory) => BudgetCategory
  ) =>
    update({
      ...budget,
      [section]: cats.map((c) => (c.name === catName ? fn(c) : c)),
    });

  return (
    <div className={styles.group}>
      <h3 className={styles.h3}>{heading}</h3>
      {showAttachments && (
        <p className={styles.hint}>
          見積書などは右の「資料」パネルにアップロードし、各明細行の「資料」で番号を選びます。
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
                  <th className={styles.itemAmtCol}>金額</th>
                  {showAttachments && <th className={styles.atCol}>資料</th>}
                  <th className={styles.xCol} />
                </tr>
              </thead>
              <tbody>
                {c.items.map((it) => (
                  <ItemRow
                    key={it.id}
                    budget={budget}
                    section={section}
                    catName={c.name}
                    item={it}
                    readOnly={readOnly}
                    update={update}
                    mutateCat={mutateCat}
                    showAttachment={!!showAttachments}
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
                mutateCat(c.name, (cat) => ({
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
  budget,
  section,
  catName,
  item,
  readOnly,
  update,
  mutateCat,
  showAttachment,
}: {
  budget: BudgetDoc;
  section: "revenue" | "expense";
  catName: string;
  item: BudgetLineItem;
  readOnly: boolean;
  update: (b: BudgetDoc) => void;
  mutateCat: (name: string, fn: (c: BudgetCategory) => BudgetCategory) => void;
  showAttachment: boolean;
}) {
  const att = attachmentOf(budget, item.attachmentRef);

  const patchItem = (patch: Partial<BudgetLineItem>) =>
    mutateCat(catName, (cat) => ({
      ...cat,
      items: cat.items.map((x) => (x.id === item.id ? { ...x, ...patch } : x)),
    }));

  const setRef = (ref: string | null) => {
    update(
      pruneAttachments({
        ...budget,
        [section]: budget[section].map((c) =>
          c.name === catName
            ? {
                ...c,
                items: c.items.map((x) =>
                  x.id === item.id ? { ...x, attachmentRef: ref } : x
                ),
              }
            : c
        ),
      })
    );
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
          maxLength={12}
          value={item.amount}
          readOnly={readOnly}
          onChange={(e) => patchItem({ amount: e.target.value })}
        />
      </td>
      {showAttachment && (
        <td className={styles.atCell}>
          {readOnly ? (
            att ? (
              <button
                type="button"
                className={styles.attachLink}
                onClick={() => openFileByIdAsync(att.fileId, att.name)}
              >
                {att.no}. {att.name}
              </button>
            ) : (
              ""
            )
          ) : (
            <div className={styles.atPick}>
              <select
                className={styles.atSelect}
                value={item.attachmentRef ?? ""}
                onChange={(e) => setRef(e.target.value || null)}
              >
                <option value="">— なし —</option>
                {[...budget.attachments]
                  .sort((a, b) => a.no - b.no)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.no}. {a.name}
                    </option>
                  ))}
              </select>
              {att && (
                <button
                  type="button"
                  className={styles.atOpen}
                  title="開く"
                  onClick={() => openFileByIdAsync(att.fileId, att.name)}
                >
                  ↗
                </button>
              )}
            </div>
          )}
        </td>
      )}
      <td>
        {!readOnly && (
          <button
            type="button"
            className={styles.xBtn}
            onClick={() =>
              update(
                pruneAttachments({
                  ...budget,
                  [section]: budget[section].map((c) =>
                    c.name === catName
                      ? { ...c, items: c.items.filter((x) => x.id !== item.id) }
                      : c
                  ),
                })
              )
            }
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

/** 費用明細タブの右カラム：見積書などの資料をアップロードして番号管理 */
function AttachmentPanel({
  budget,
  update,
  readOnly,
}: {
  budget: BudgetDoc;
  update: (b: BudgetDoc) => void;
  readOnly: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = [...budget.attachments].sort((a, b) => a.no - b.no);

  const doUpload = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setBusy(true);
    setError(null);
    try {
      let doc = budget;
      for (const f of arr) {
        try {
          const obj = await uploadFile("budget", budget.id, f);
          const res = addOrReuseAttachment(doc, obj.id, obj.name);
          if (res.attachment.fileId !== obj.id) void deleteFileObj(obj.id);
          doc = res.doc;
        } catch (e) {
          setError(
            e instanceof Error ? `${f.name}: ${e.message}` : `${f.name}: 失敗`
          );
        }
      }
      update(doc);
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = (attId: string) => {
    const target = budget.attachments.find((a) => a.id === attId);
    if (!target) return;
    if (
      !confirm(
        `「${target.no}. ${target.name}」を削除します。参照している明細行の資料も外れます。`
      )
    )
      return;
    const cleared = (cats: BudgetCategory[]) =>
      cats.map((c) => ({
        ...c,
        items: c.items.map((it) =>
          it.attachmentRef === attId ? { ...it, attachmentRef: null } : it
        ),
      }));
    update(
      pruneAttachments({
        ...budget,
        revenue: cleared(budget.revenue),
        expense: cleared(budget.expense),
      })
    );
  };

  return (
    <aside className={styles.side}>
      <div className={styles.sideTitle}>見積書などの資料</div>
      {error && <div className={styles.sideErr}>{error}</div>}

      {!readOnly && (
        <div
          className={`${styles.sideDz} ${dragOver ? styles.sideDzOver : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            doUpload(e.dataTransfer.files);
          }}
        >
          <span className={styles.sideDzText}>
            {busy ? "アップロード中…" : "D&D または"}
          </span>
          {!busy && (
            <button
              type="button"
              className={styles.sideSelect}
              onClick={() => fileRef.current?.click()}
            >
              ファイルを選択
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) doUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {list.length === 0 ? (
        <p className={styles.sideEmpty}>資料がありません。</p>
      ) : (
        <ol className={styles.sideList}>
          {list.map((a) => (
            <li key={a.id} className={styles.sideItem}>
              <span className={styles.sideNo}>{a.no}</span>
              <button
                type="button"
                className={styles.sideName}
                title={a.name}
                onClick={() => openFileByIdAsync(a.fileId, a.name)}
              >
                {a.name}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className={styles.sideDel}
                  onClick={() => removeAttachment(a.id)}
                >
                  削除
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className={styles.sideHint}>
        番号はアップロード順。明細行の「資料」でこの番号を選びます。
      </p>
    </aside>
  );
}
