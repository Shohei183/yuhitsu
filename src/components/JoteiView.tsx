"use client";

import Link from "next/link";
import { useRef } from "react";
import { useJotei } from "@/lib/useJoteiStore";
import { useCan } from "@/lib/useOrg";
import { downloadDocHtml } from "@/lib/download";
import JoteiDoc from "./JoteiDoc";
import styles from "./JoteiView.module.css";

export default function JoteiView({ joteiId }: { joteiId: string }) {
  const jotei = useJotei(joteiId);
  const can = useCan();
  const docRef = useRef<HTMLDivElement>(null);

  if (!jotei) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>上程届が見つかりません。</p>
          <Link href="/jotei">← 上程届一覧へ</Link>
        </div>
      </div>
    );
  }

  const onDownload = () => {
    void downloadDocHtml(
      docRef.current,
      `上程届_${jotei.committeeName}_${jotei.meetingName || "未設定"}`,
      `上程届：${jotei.committeeName}／${jotei.meetingName}`
    ).catch((e) => console.error("[上程届] ダウンロード失敗:", e));
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/jotei" className={styles.navLink}>
          ← 上程届一覧
        </Link>
        <Link
          href={`/committee/${jotei.committeeId}/jotei`}
          className={styles.navLink}
        >
          {jotei.committeeName} の上程届 →
        </Link>
        {jotei.status !== "submitted" && can.editGian && (
          <Link href={`/jotei/${joteiId}`} className={styles.navLink}>
            編集画面へ →
          </Link>
        )}
        <button type="button" className={styles.downloadBtn} onClick={onDownload}>
          ダウンロード
        </button>
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={() => window.print()}
        >
          PDF出力（A4）
        </button>
        {jotei.status === "submitted" && (
          <span className={styles.lockTag}>提出済み</span>
        )}
      </div>

      <div ref={docRef} className={styles.doc}>
        <JoteiDoc jotei={jotei} />
      </div>
    </div>
  );
}
