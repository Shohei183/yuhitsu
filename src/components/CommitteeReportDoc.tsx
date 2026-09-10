"use client";

import { CommitteeReport } from "@/lib/committeeReportStore";
import { sanitizeRichHtml } from "@/lib/richText";
import { useLomName } from "@/lib/useSettingsStore";
import styles from "./CommitteeReportDoc.module.css";

/** 委員会報告を1枚のドキュメントとして描画（閲覧・PDF 共用） */
export default function CommitteeReportDoc({
  report,
  yearLabel,
}: {
  report: CommitteeReport;
  yearLabel: string;
}) {
  const lom = useLomName();

  return (
    <article className={styles.doc}>
      <div className={styles.lom}>{lom}</div>
      <h1 className={styles.title}>委員会報告</h1>
      <div className={styles.meta}>
        <span>委員会名：{report.committeeName}</span>
        <span>{yearLabel}</span>
      </div>

      {report.meetings.length === 0 ? (
        <p className={styles.empty}>会議の記録がありません。</p>
      ) : (
        <div className={styles.meetings}>
          {report.meetings.map((m, i) => {
            const content = sanitizeRichHtml(m.content);
            return (
              <section key={m.id} className={styles.meeting}>
                <div className={styles.mHead}>
                  <span className={styles.mNo}>{i + 1}</span>
                  <span className={styles.mDateLabel}>開催日</span>
                  <span className={styles.mDate}>{m.date || "—"}</span>
                </div>
                <div className={styles.row}>
                  <div className={styles.rLabel}>出席者</div>
                  <div className={styles.rValueAtt}>{m.attendees || "—"}</div>
                </div>
                <div className={styles.row}>
                  <div className={styles.rLabel}>内容</div>
                  {content ? (
                    <div
                      className={styles.rValue}
                      dangerouslySetInnerHTML={{ __html: content }}
                    />
                  ) : (
                    <div className={styles.rValue}>—</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}
