"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PERIOD_LABEL, getYear } from "@/lib/yearStore";
import { useDistribution } from "@/lib/useDistributionStore";
import { useFixedFiles } from "@/lib/useFixedFiles";
import { openFileByIdAsync } from "@/lib/backend/files";
import { downloadDocHtml } from "@/lib/download";
import { formatJaDateTime } from "@/lib/format";
import { getEntry } from "@/lib/gianStore";
import { useGianStore } from "@/lib/useGianStore";
import { useBudgetStore } from "@/lib/useBudgetStore";
import BudgetDoc from "./BudgetDoc";
import { referencedGianIds } from "@/lib/gianMeta";
import type { Gian } from "@/lib/mockData";
import GianView from "./GianView";
import SidaiDoc from "./SidaiDoc";
import CommitteeReportDoc from "./CommitteeReportDoc";
import MyReviewNotes from "./MyReviewNotes";
import styles from "./DistributionView.module.css";

const fmt = formatJaDateTime;

export default function DistributionView({ distId }: { distId: string }) {
  const { pkg, loading } = useDistribution(distId);
  const { files: fixedFiles } = useFixedFiles(pkg?.yearId ?? "");
  const gianStore = useGianStore();
  const budgetStore = useBudgetStore();
  const exportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!pkg) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>{loading ? "配信データを読み込み中…" : "配信データが見つかりません。"}</p>
          <Link prefetch={false} href="/sidai">← 次第作成へ</Link>
        </div>
      </div>
    );
  }

  // 収録議案の中から張られている他の議案（添付追加・関連議案）。収録されていないものは
  // ダウンロード時点の内容をファイルへ同梱し、ファイル内でリンクが飛べるようにする。
  // （下書き中の議案は含めない）
  const refGians: Gian[] = [];
  {
    const seen = new Set(pkg.gians.map((g) => g.id));
    const queue = pkg.gians.flatMap(referencedGianIds);
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const g = gianStore[id]?.gian;
      if (!g || g.status === "editing") continue;
      refGians.push(g);
      queue.push(...referencedGianIds(g));
    }
  }

  // 収録議案・参照先議案にリンクされた予算書（見積書つき）もファイルへ同梱する
  const gianIdsAll = new Set([...pkg.gians, ...refGians].map((g) => g.id));
  const budgetOf = (gianId: string) =>
    gianIdsAll.has(gianId)
      ? Object.values(budgetStore).find((b) => b.gianId === gianId)
      : undefined;
  /** その議案の予算書だけを、議案の直後に置く（議案ごとに独立した予算書にする） */
  const budgetBlock = (g: Gian) => {
    const b = budgetOf(g.id);
    if (!b) return null;
    return (
      <div data-export-gian id={`budget-${b.id}`}>
        <p className={styles.empty}>
          ※ 「{g.topic}」の事業収支予算書（ダウンロード時点の内容）
        </p>
        <BudgetDoc budget={b} />
      </div>
    );
  };

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
      reportById={(id) => pkg.reports?.find((r) => r.id === id) ?? null}
      linkReportTo={(r) => `/haishin/${distId}/report/${r.id}`}
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
        <Link prefetch={false} href="/sidai" className={styles.navLink}>
          ← 次第作成
        </Link>
        <Link prefetch={false} href={`/sidai/${pkg.sourceSidaiId}/view`} className={styles.navLink}>
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
              {budgetBlock(g)}
            </div>
          ))}
          {refGians.map((g) => (
            <div key={g.id} data-export-gian id={`gian-${g.id}`}>
              <p className={styles.empty}>
                ※ 収録議案から参照されている議案（ダウンロード時点の内容）
              </p>
              <GianView gian={g} gianId={g.id} embedded />
              {budgetBlock(g)}
            </div>
          ))}
          {(pkg.reports ?? []).map((r) => (
            <div key={r.id} data-export-gian id={`report-${r.id}`}>
              <CommitteeReportDoc
                report={r}
                yearLabel={getYear(pkg.yearId)?.label ?? pkg.yearId}
              />
            </div>
          ))}
        </div>
      </div>

      <MyReviewNotes
        distId={distId}
        gianHref={(gid) =>
          pkg.gians.some((x) => x.id === gid)
            ? `/haishin/${distId}/gian/${gid}`
            : `/gian/${gid}/view?dist=${encodeURIComponent(distId)}`
        }
        gianTitle={(gid) => {
          const g = pkg.gians.find((x) => x.id === gid);
          if (!g) {
            const live = getEntry(gid)?.gian;
            return live
              ? `${live.kind === "基本方針" ? "基本方針" : `${live.kind}議案`}：${live.topic}`
              : "（収録外の議案）";
          }
          return `${g.kind === "基本方針" ? "基本方針" : `${g.kind}議案`}：${g.topic}`;
        }}
      />
    </div>
  );
}
