"use client";

import { useEffect, useState } from "react";
import {
  BudgetSnapshot,
  balance,
  listBudgetSnapshots,
  restoreBudgetSnapshot,
  sectionTotal,
} from "@/lib/budgetStore";
import { formatJaDateTime } from "@/lib/format";
import { jpNum } from "@/lib/format";
import styles from "./BudgetHistoryDialog.module.css";

function lineCount(s: BudgetSnapshot): number {
  return [...s.doc.revenue, ...s.doc.expense].reduce(
    (n, c) => n + c.items.length,
    0
  );
}

/** 予算書の保存履歴。時点を選んで内容を確認し、その時点に戻せる（編集中のみ）。 */
export default function BudgetHistoryDialog({
  budgetId,
  canRestore,
  onClose,
}: {
  budgetId: string;
  /** 編集中のときだけ復元できる（編集ロックの対象にするため） */
  canRestore: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BudgetSnapshot[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listBudgetSnapshots(budgetId).then((r) => {
      if (alive) setItems(r);
    });
    return () => {
      alive = false;
    };
  }, [budgetId]);

  const restore = (s: BudgetSnapshot) => {
    if (
      !confirm(
        `${formatJaDateTime(s.takenAt)} の内容に戻します。\n現在の内容は、履歴（「復元の直前」）に残ります。\n\nよろしいですか？`
      )
    )
      return;
    restoreBudgetSnapshot(budgetId, s);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="予算書の保存履歴"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>保存履歴</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <p className={styles.hint}>
          編集を始めたとき・「保存して終了」したとき・10分ごとの保存を残しています（新しい100件まで）。
          {canRestore
            ? ""
            : "内容を戻すには、「編集開始」を押してから、この画面を開いてください。"}
        </p>
        <div className={styles.list}>
          {items === null ? (
            <p className={styles.empty}>読み込み中…</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>履歴はまだありません。</p>
          ) : (
            items.map((s) => (
              <div key={s.id} className={styles.row}>
                <div className={styles.meta}>
                  <div className={styles.when}>
                    {formatJaDateTime(s.takenAt)}
                    <span className={styles.reason}>{s.reason}</span>
                  </div>
                  <div className={styles.sub}>
                    {s.memberName ? `${s.memberName} ／ ` : ""}
                    収益 ¥{jpNum(sectionTotal(s.doc.revenue))} ／ 費用 ¥
                    {jpNum(sectionTotal(s.doc.expense))} ／ 収支 ¥
                    {jpNum(balance(s.doc))} ／ 明細 {lineCount(s)}行 ／ 資料{" "}
                    {s.doc.attachments.length}件
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.restore}
                  disabled={!canRestore}
                  onClick={() => restore(s)}
                >
                  この時点に戻す
                </button>
              </div>
            ))
          )}
        </div>
        <p className={styles.note}>
          戻した内容に含まれる資料のうち、その後に削除したファイルは開けません。
        </p>
      </div>
    </div>
  );
}
