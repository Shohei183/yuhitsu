"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PERIOD_LABEL, getYear } from "@/lib/yearStore";
import { useDistribution } from "@/lib/useDistributionStore";
import GianView from "./GianView";
import styles from "./GianView.module.css";

/**
 * 配信データに収録された議案（確定時点の凍結コピー）を1枚のドキュメントで表示。
 * 実データではなく `DistributionPackage.gians` の凍結コピー＋ `gianFiles` のメタを使う。
 */
export default function FrozenGianView({
  distId,
  gianId,
}: {
  distId: string;
  gianId: string;
}) {
  const pkg = useDistribution(distId);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const gian = pkg?.gians.find((g) => g.id === gianId);

  if (!pkg || !gian) {
    if (!mounted) return <div className={styles.page} aria-hidden />;
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>収録議案が見つかりません。</p>
          <Link href={`/haishin/${distId}`}>← 配信データへ</Link>
        </div>
      </div>
    );
  }

  return (
    <GianView
      gian={gian}
      frozenFiles={pkg.gianFiles[gianId] ?? { review: [], reference: [] }}
      toolbar={
        <>
          <Link href={`/haishin/${distId}`} className={styles.navLink}>
            ← 配信データ
          </Link>
          <span className={styles.snapTag}>
            {getYear(pkg.yearId)?.label ?? pkg.yearId}／
            {PERIOD_LABEL[pkg.period]}・{pkg.name}_v{pkg.version} の収録議案
            （確定時点・完全ロック）
          </span>
        </>
      }
    />
  );
}
