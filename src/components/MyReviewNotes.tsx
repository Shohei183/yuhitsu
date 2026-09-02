"use client";

import Link from "next/link";
import { notesForDist } from "@/lib/reviewNoteStore";
import { useReviewNoteStore } from "@/lib/useReviewNoteStore";
import styles from "./MyReviewNotes.module.css";

/** 配信データ内の「自分のレビューメモ」まとめ（会議での発言用・非公開） */
export default function MyReviewNotes({
  distId,
  gianTitle,
}: {
  distId: string;
  gianTitle: (gianId: string) => string;
}) {
  useReviewNoteStore();
  const notes = notesForDist(distId);

  // 議案ごとにまとめる（登場順）
  const groups: { gianId: string; items: typeof notes }[] = [];
  const idx = new Map<string, number>();
  for (const n of notes) {
    if (!idx.has(n.gianId)) {
      idx.set(n.gianId, groups.length);
      groups.push({ gianId: n.gianId, items: [] });
    }
    groups[idx.get(n.gianId)!].items.push(n);
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          🔒 自分のレビューメモ（{notes.length}）
        </h2>
        {notes.length > 0 && (
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
          >
            印刷
          </button>
        )}
      </div>
      <p className={styles.note}>
        あなたにしか見えません。会議ではこれを見ながら発言します。メモは各収録議案を開いて本文を選択すると付けられます。
      </p>

      {notes.length === 0 ? (
        <p className={styles.empty}>まだメモはありません。</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <div key={g.gianId} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupTitle}>{gianTitle(g.gianId)}</span>
                <Link
                  href={`/haishin/${distId}/gian/${g.gianId}`}
                  className={styles.groupLink}
                >
                  議案を開く →
                </Link>
              </div>
              <ol className={styles.list}>
                {g.items.map((n) => (
                  <li key={n.id} className={styles.item}>
                    <div className={styles.itemLabel}>{n.itemLabel}</div>
                    <blockquote className={styles.quote}>
                      {n.quoteExact}
                    </blockquote>
                    <div className={styles.body}>{n.body}</div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
