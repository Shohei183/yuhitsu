"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listJoteiForYear, submittedMeetings } from "@/lib/joteiStore";
import { useJoteiStore } from "@/lib/useJoteiStore";
import { useActiveYear, useCan } from "@/lib/useOrg";
import JoteiDoc from "./JoteiDoc";
import styles from "./JoteiList.module.css";

export default function JoteiList() {
  const year = useActiveYear();
  useJoteiStore();
  const can = useCan();
  const [meeting, setMeeting] = useState<string>("");

  const yearId = year?.id ?? "";
  const meetings = submittedMeetings(yearId);
  const all = listJoteiForYear(yearId);

  useEffect(() => {
    if (meetings.length > 0 && !meetings.includes(meeting)) {
      setMeeting(meetings[0]);
    }
  }, [meetings, meeting]);

  const submittedForMeeting = all.filter(
    (j) => j.status === "submitted" && j.meetingName.trim() === meeting
  );
  const drafts = all.filter((j) => j.status !== "submitted");

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

      {meetings.length === 0 ? (
        <p className={styles.empty}>提出済みの上程届はまだありません。</p>
      ) : (
        <>
          <div className={styles.meetingRow}>
            <label className={styles.meetingLabel}>会議</label>
            <select
              className={styles.meetingSelect}
              value={meeting}
              onChange={(e) => setMeeting(e.target.value)}
            >
              {meetings.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className={styles.meetingCount}>
              {submittedForMeeting.length} 件
            </span>
          </div>

          <div className={styles.docs}>
            {submittedForMeeting.map((j) => (
              <div key={j.id} className={styles.docCard}>
                <div className={styles.docCardHead}>
                  <span className={styles.docCardName}>{j.committeeName}</span>
                  <Link href={`/jotei/${j.id}/view`} className={styles.docCardLink}>
                    単独表示・印刷 →
                  </Link>
                </div>
                <JoteiDoc jotei={j} />
              </div>
            ))}
          </div>
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
