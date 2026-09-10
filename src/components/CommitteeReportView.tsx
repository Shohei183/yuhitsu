"use client";

import Link from "next/link";
import { reportForCommittee } from "@/lib/committeeReportStore";
import { useCommitteeReportStore } from "@/lib/useCommitteeReportStore";
import { useCommittee, useCan } from "@/lib/useOrg";
import CommitteeReportDoc from "./CommitteeReportDoc";
import styles from "./CommitteeReportView.module.css";

export default function CommitteeReportView({
  committeeId,
}: {
  committeeId: string;
}) {
  const found = useCommittee(committeeId);
  useCommitteeReportStore();
  const can = useCan();

  if (!found) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>委員会が見つかりません。</p>
          <Link href="/">← トップへ</Link>
        </div>
      </div>
    );
  }

  const { year, committee } = found;
  const report = reportForCommittee(committeeId);

  if (!report) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>この委員会の委員会報告はまだありません。</p>
          <Link
            href={`/committee/${committeeId}/report`}
            className={styles.navLink}
          >
            → 委員会報告を作成
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/committee/${committeeId}`} className={styles.navLink}>
          ← {committee.name}
        </Link>
        {can.editGian && (
          <Link
            href={`/committee/${committeeId}/report`}
            className={styles.navLink}
          >
            編集画面へ →
          </Link>
        )}
        <button
          type="button"
          className={styles.pdfBtn}
          onClick={() => window.print()}
        >
          PDF出力（A4）
        </button>
      </div>

      <div className={styles.doc}>
        <CommitteeReportDoc report={report} yearLabel={year.label} />
      </div>
    </div>
  );
}
