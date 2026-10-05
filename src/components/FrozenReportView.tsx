"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PERIOD_LABEL, getYear } from "@/lib/yearStore";
import { useDistribution } from "@/lib/useDistributionStore";
import CommitteeReportDoc from "./CommitteeReportDoc";
import styles from "./CommitteeReportView.module.css";

/** 配信データに収録された委員会報告（確定時点の凍結コピー）を表示 */
export default function FrozenReportView({
  distId,
  reportId,
}: {
  distId: string;
  reportId: string;
}) {
  const pkg = useDistribution(distId);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const report = pkg?.reports?.find((r) => r.id === reportId);

  if (!pkg || !report) {
    if (!mounted) return <div className={styles.page} aria-hidden />;
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>収録された委員会報告が見つかりません。</p>
          <Link href={`/haishin/${distId}`}>← 配信データへ</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/haishin/${distId}`} className={styles.navLink}>
          ← 配信データ
        </Link>
        <span className={styles.navLink}>
          {getYear(pkg.yearId)?.label ?? pkg.yearId}／{PERIOD_LABEL[pkg.period]}・
          {pkg.name}_v{pkg.version} の収録委員会報告（確定時点）
        </span>
        <button
          type="button"
          className={styles.pdfBtn}
          onClick={() => window.print()}
        >
          PDF出力（A4）
        </button>
      </div>
      <div className={styles.doc}>
        <CommitteeReportDoc
          report={report}
          yearLabel={getYear(pkg.yearId)?.label ?? pkg.yearId}
        />
      </div>
    </div>
  );
}
