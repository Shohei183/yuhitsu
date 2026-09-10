"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  blankMeeting,
  deleteReport,
  ensureReport,
  reportForCommittee,
  saveReport,
} from "@/lib/committeeReportStore";
import { useCommitteeReportStore } from "@/lib/useCommitteeReportStore";
import { useCommittee, useAuthMember, useCan } from "@/lib/useOrg";
import { formatJaDate } from "@/lib/format";
import RichText from "./RichText";
import { useLomName } from "@/lib/useSettingsStore";
import styles from "./CommitteeReport.module.css";

export default function CommitteeReport({
  committeeId,
}: {
  committeeId: string;
}) {
  const router = useRouter();
  const found = useCommittee(committeeId);
  useCommitteeReportStore();
  const member = useAuthMember();
  const can = useCan();
  const lom = useLomName();

  if (!found) {
    return (
      <main className={styles.wrap}>
        <p className={styles.notFound}>委員会が見つかりません。</p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </main>
    );
  }

  const { year, committee } = found;
  const report = reportForCommittee(committeeId);
  const readOnly = !can.editGian;

  const create = () => {
    ensureReport({
      yearId: year.id,
      committeeId,
      committeeName: committee.name,
    });
  };

  if (!report) {
    return (
      <main className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.crumb}>
            {year.label} ／ {committee.name} ／ 委員会報告
          </div>
          <h1 className={styles.title}>委員会報告</h1>
          <Link href={`/committee/${committeeId}`} className={styles.back}>
            ← {committee.name}
          </Link>
        </div>
        <p className={styles.note}>
          この委員会の委員会報告はまだありません。会議のたびに1件ずつ追記していきます。
        </p>
        {can.editGian ? (
          <button type="button" className={styles.primaryBtn} onClick={create}>
            委員会報告を作成する
          </button>
        ) : (
          <p className={styles.note}>作成の権限がありません。</p>
        )}
      </main>
    );
  }

  const update = (meetings: typeof report.meetings) =>
    saveReport(report.id, { ...report, meetings });

  const mutate = (id: string, patch: Partial<(typeof report.meetings)[number]>) =>
    update(report.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const addMeeting = () => update([...report.meetings, blankMeeting()]);
  const removeMeeting = (id: string) =>
    update(report.meetings.filter((m) => m.id !== id));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/committee/${committeeId}`} className={styles.navLink}>
          ← {committee.name}
        </Link>
        <Link
          href={`/committee/${committeeId}/report/view`}
          className={styles.navLink}
        >
          閲覧・PDF出力 →
        </Link>
        {member?.isMaster && (
          <button
            type="button"
            className={styles.delBtn}
            onClick={() => {
              if (
                !window.confirm(
                  "この委員会報告を削除します。すべての会議記録が消えます。よろしいですか？"
                )
              )
                return;
              deleteReport(report.id);
              router.push(`/committee/${committeeId}`);
            }}
          >
            削除
          </button>
        )}
      </div>

      <article className={styles.doc}>
        <div className={styles.docLom}>{lom}</div>
        <h1 className={styles.docTitle}>委員会報告</h1>
        <div className={styles.docMeta}>
          <span>委員会名：{report.committeeName || committee.name}</span>
          <span>{year.label}</span>
        </div>

        {report.meetings.length === 0 && (
          <p className={styles.emptyRow}>会議の記録がありません。</p>
        )}

        <div className={styles.meetings}>
          {report.meetings.map((m, i) => (
            <section key={m.id} className={styles.meeting}>
              <div className={styles.meetingHead}>
                <span className={styles.meetingNo}>{i + 1}</span>
                <span className={styles.meetingDateLabel}>開催日</span>
                {readOnly ? (
                  <span className={styles.meetingDate}>{m.date || "—"}</span>
                ) : (
                  <input
                    className={styles.dateInput}
                    value={m.date}
                    placeholder="2026年01月08日"
                    onChange={(e) => mutate(m.id, { date: e.target.value })}
                    onBlur={(e) => {
                      const f = formatJaDate(e.target.value);
                      if (f && f !== e.target.value)
                        mutate(m.id, { date: f });
                    }}
                  />
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className={styles.xBtn}
                    title="この会議を削除"
                    onClick={() => removeMeeting(m.id)}
                  >
                    ×
                  </button>
                )}
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>出席者</div>
                {readOnly ? (
                  <div className={styles.attView}>{m.attendees || "—"}</div>
                ) : (
                  <textarea
                    className={styles.attInput}
                    rows={3}
                    value={m.attendees}
                    placeholder={"筒井 健太郎\n奥村 潤哉\n…（1行1名）"}
                    onChange={(e) =>
                      mutate(m.id, { attendees: e.target.value })
                    }
                  />
                )}
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>内容</div>
                <RichText
                  value={m.content}
                  readOnly={readOnly}
                  placeholder="協議・審議・報告した内容"
                  onChange={(html) => mutate(m.id, { content: html })}
                />
              </div>
            </section>
          ))}
        </div>

        {!readOnly && (
          <button type="button" className={styles.addBtn} onClick={addMeeting}>
            ＋ 会議を追加
          </button>
        )}
      </article>
    </div>
  );
}
