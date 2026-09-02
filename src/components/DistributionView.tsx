"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PERIOD_LABEL, getYear } from "@/lib/yearStore";
import { useDistribution } from "@/lib/useDistributionStore";
import { useFixedFiles } from "@/lib/useFixedFiles";
import { openFileByIdAsync } from "@/lib/backend/files";
import { downloadDocHtml } from "@/lib/download";
import GianView from "./GianView";
import SidaiDoc from "./SidaiDoc";
import styles from "./DistributionView.module.css";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DistributionView({ distId }: { distId: string }) {
  const pkg = useDistribution(distId);
  const { files: fixedFiles } = useFixedFiles(pkg?.yearId ?? "");
  const exportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!pkg) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>配信データが見つかりません。</p>
          <Link href="/sidai">← 次第作成へ</Link>
        </div>
      </div>
    );
  }

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadDocHtml(
        exportRef.current,
        `配信データ_${pkg.name}_v${pkg.version}`,
        `配信データ：${pkg.name}_v${pkg.version}`
      );
    } catch (e) {
      console.error("[配信データ] ダウンロード失敗:", e);
      alert("ダウンロードの生成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDownloading(false);
    }
  };

  const sidaiDoc = (
    <SidaiDoc
      sidai={pkg.sidai}
      gianById={(id) => pkg.gians.find((g) => g.id === id) ?? null}
      linkGianTo={(id) => `/haishin/${distId}/gian/${id}`}
      fixedFileById={(id) => fixedFiles.find((f) => f.id === id) ?? null}
      onOpenFixedFile={(id, name) => openFileByIdAsync(id, name)}
    />
  );

  const docHeader = (
    <header className={styles.head}>
      <div className={styles.kicker}>配信データ</div>
      <h1 className={styles.name}>
        {pkg.name}_v{pkg.version}
      </h1>
      <div className={styles.meta}>
        <span>
          {getYear(pkg.yearId)?.label ?? pkg.yearId}／{PERIOD_LABEL[pkg.period]}
        </span>
        <span>
          配信フォルダ：配信／{pkg.board}／{pkg.occurrence}
        </span>
        <span>確定日時：{fmt(pkg.finalizedAt)}</span>
      </div>
    </header>
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/sidai" className={styles.navLink}>
          ← 次第作成
        </Link>
        <Link href={`/sidai/${pkg.sourceSidaiId}/view`} className={styles.navLink}>
          元の次第 →
        </Link>
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={onDownload}
          disabled={downloading}
          title="配信データ（次第＋収録議案＋資料ファイル）を単一 HTML ファイルとして保存"
        >
          {downloading ? "生成中…" : "ダウンロード"}
        </button>
        <span className={styles.lockTag}>完全ロック（編集不可）</span>
      </div>

      <div ref={exportRef}>
        <article className={styles.doc}>
          {docHeader}
          <h2 className={styles.h2}>次第</h2>
          <div className={styles.sidaiBox}>{sidaiDoc}</div>
          <p className={styles.empty}>
            ※ 次第の議案名リンクから、確定時点の議案を開けます（ダウンロード版は
            同じファイル内の該当議案へ移動し、資料ファイルもファイル内に同梱されます）。
          </p>
        </article>

        {/* ダウンロード時のみ出力：収録議案（確定時点の凍結コピー）を次第の後ろに連結 */}
        <div data-export-show style={{ display: "none" }}>
          {pkg.gians.map((g) => (
            <div key={g.id} data-export-gian id={`gian-${g.id}`}>
              <GianView
                gian={g}
                frozenFiles={
                  pkg.gianFiles[g.id] ?? { review: [], reference: [] }
                }
                embedded
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
