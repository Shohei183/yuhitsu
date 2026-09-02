"use client";

import Link from "next/link";
import { useRef } from "react";
import { JoteiTodoke, listJoteiForYear } from "@/lib/joteiStore";
import { useJoteiStore } from "@/lib/useJoteiStore";
import { useActiveYear, useCan } from "@/lib/useOrg";
import { downloadDocHtml } from "@/lib/download";
import JoteiDoc from "./JoteiDoc";
import styles from "./JoteiList.module.css";

const NO_MEETING = "（会議名未設定）";

export default function JoteiList() {
  const year = useActiveYear();
  useJoteiStore();
  const can = useCan();
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const yearId = year?.id ?? "";
  const all = listJoteiForYear(yearId);
  const drafts = all.filter((j) => j.status !== "submitted");

  // 提出済みを会議ごとにグループ化（会議の初出順）
  const groups: { meeting: string; items: JoteiTodoke[] }[] = [];
  const index = new Map<string, number>();
  for (const j of all) {
    if (j.status !== "submitted") continue;
    const m = j.meetingName.trim() || NO_MEETING;
    if (!index.has(m)) {
      index.set(m, groups.length);
      groups.push({ meeting: m, items: [] });
    }
    groups[index.get(m)!].items.push(j);
  }

  const downloadMeeting = (meeting: string) => {
    const el = exportRefs.current[meeting];
    void downloadDocHtml(
      el,
      `上程届まとめ_${year?.label ?? ""}_${meeting}`,
      `上程届（${meeting}）— ${groups.find((g) => g.meeting === meeting)?.items.length ?? 0}委員会`
    ).catch((e) => console.error("[上程届] まとめDL失敗:", e));
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>{year?.label} ／ 上程届</div>
        <h1 className={styles.title}>上程届 一覧</h1>
        <p className={styles.note}>
          提出された上程届を会議ごとにまとめています。会議単位で全委員会分を1ファイルに書き出せます。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className={styles.empty}>提出済みの上程届はまだありません。</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <section key={g.meeting} className={styles.group}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle}>{g.meeting}</h2>
                <span className={styles.groupCount}>{g.items.length} 委員会</span>
                <button
                  type="button"
                  className={styles.groupDl}
                  onClick={() => downloadMeeting(g.meeting)}
                >
                  この会議の上程届をまとめてダウンロード
                </button>
              </div>

              <div className={styles.docs}>
                {g.items.map((j) => (
                  <div key={j.id} className={styles.docCard}>
                    <div className={styles.docCardHead}>
                      <span className={styles.docCardName}>{j.committeeName}</span>
                      <Link
                        href={`/jotei/${j.id}/view`}
                        className={styles.docCardLink}
                      >
                        単独表示・印刷 →
                      </Link>
                    </div>
                    <JoteiDoc jotei={j} />
                  </div>
                ))}
              </div>

              {/* まとめDL用（非表示）：会議ごとに全委員会分を連結 */}
              <div style={{ display: "none" }} aria-hidden="true">
                <div
                  ref={(el) => {
                    exportRefs.current[g.meeting] = el;
                  }}
                >
                  {g.items.map((j) => (
                    <div
                      key={j.id}
                      data-export-gian
                      style={{ marginBottom: 32 }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                        {j.committeeName}
                      </div>
                      <JoteiDoc jotei={j} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {can.editGian && drafts.length > 0 && (
        <div className={styles.draftBlock}>
          <h2 className={styles.draftTitle}>下書き（未提出）</h2>
          <ul className={styles.list}>
            {drafts.map((j) => (
              <li key={j.id} className={styles.item}>
                <Link href={`/jotei/${j.id}`} className={styles.itemMain}>
                  <span className={`${styles.statusTag} ${styles.draft}`}>
                    下書き
                  </span>
                  <span className={styles.itemTitle}>
                    {j.committeeName}／{j.meetingName || "（会議名未設定）"}
                  </span>
                  <span className={styles.itemCount}>
                    協議{j.kyogi.length}／審議{j.shingi.length}／報告
                    {j.houkoku.length}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
