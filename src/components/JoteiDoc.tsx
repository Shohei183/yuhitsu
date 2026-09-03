"use client";

// 上程届を1枚のドキュメントとして描画する共通コンポーネント（閲覧・印刷・DL 共用）

import { JoteiTodoke, JOTEI_SECTIONS, sectionItems } from "@/lib/joteiStore";
import { formatJaDate } from "@/lib/format";
import { useLomName } from "@/lib/useSettingsStore";
import styles from "./JoteiDoc.module.css";

export default function JoteiDoc({ jotei }: { jotei: JoteiTodoke }) {
  const lom = useLomName();
  return (
    <article className={styles.doc}>
      <div className={styles.lom}>{lom}</div>
      <h1 className={styles.title}>上　程　届</h1>

      <p className={styles.lead}>
        下記の議案について
        <strong>{jotei.meetingName || "（会議名未記入）"}</strong>
        に上程いたします。
      </p>

      <div className={styles.meta}>
        <div className={styles.date}>
          {jotei.submissionDate ? formatJaDate(jotei.submissionDate) : "　"}
        </div>
        <div className={styles.submitter}>
          {jotei.committeeName}　{jotei.submitterRole}　{jotei.submitterName}
        </div>
      </div>

      {JOTEI_SECTIONS.map(({ key, label }) => {
        const items = sectionItems(jotei, key);
        return (
          <section key={key} className={styles.section}>
            <h2 className={styles.sectionTitle}>■{label}</h2>
            {items.length === 0 ? (
              <p className={styles.empty}>（なし）</p>
            ) : (
              <ol className={styles.list}>
                {items.map((it, i) => (
                  <li key={it.id} className={styles.item}>
                    <span className={styles.no}>{i + 1}．</span>
                    <span className={styles.itemText}>
                      {it.title || "（未記入）"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </article>
  );
}
