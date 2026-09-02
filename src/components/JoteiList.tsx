"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JoteiTodoke, listJoteiForYear } from "@/lib/joteiStore";
import { useJoteiStore } from "@/lib/useJoteiStore";
import { useActiveYear, useCan } from "@/lib/useOrg";
import JoteiDoc from "./JoteiDoc";
import styles from "./JoteiList.module.css";

const NO_MEETING = "（会議名未設定）";

export default function JoteiList() {
  const year = useActiveYear();
  useJoteiStore();
  const can = useCan();
  const [selected, setSelected] = useState<string>("");

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

  const meetingKeys = groups.map((g) => g.meeting);
  useEffect(() => {
    if (meetingKeys.length > 0 && !meetingKeys.includes(selected)) {
      setSelected(meetingKeys[0]);
    }
  }, [meetingKeys, selected]);

  const active = groups.find((g) => g.meeting === selected) ?? groups[0];

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>{year?.label} ／ 上程届</div>
        <h1 className={styles.title}>上程届 一覧</h1>
        <p className={styles.note}>
          会議を選ぶと、その会議に提出された各委員会の上程届を表示します。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className={styles.empty}>提出済みの上程届はまだありません。</p>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label="会議">
            {groups.map((g) => (
              <button
                key={g.meeting}
                type="button"
                role="tab"
                aria-selected={g.meeting === active?.meeting}
                className={`${styles.tab} ${
                  g.meeting === active?.meeting ? styles.tabActive : ""
                }`}
                onClick={() => setSelected(g.meeting)}
              >
                {g.meeting}
                <span className={styles.tabCount}>{g.items.length}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className={styles.docs}>
              {active.items.map((j) => (
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
          )}
        </>
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
