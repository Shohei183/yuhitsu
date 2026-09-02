"use client";

import Link from "next/link";
import { useRef } from "react";
import { useSidai } from "@/lib/useSidaiStore";
import { useGianStore } from "@/lib/useGianStore";
import { useFixedFiles } from "@/lib/useFixedFiles";
import { openFileByIdAsync } from "@/lib/backend/files";
import { downloadDocHtml } from "@/lib/download";
import { useCan } from "@/lib/useOrg";
import SidaiDoc from "./SidaiDoc";
import styles from "./SidaiView.module.css";

export default function SidaiView({ sidaiId }: { sidaiId: string }) {
  const sidai = useSidai(sidaiId);
  const gianStore = useGianStore();
  const can = useCan();
  const { files: fixedFiles } = useFixedFiles(sidai?.yearId ?? "");
  const docRef = useRef<HTMLElement>(null);

  if (!sidai) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>次第が見つかりません。</p>
          <Link href="/sidai">← 次第一覧へ</Link>
        </div>
      </div>
    );
  }

  const onDownload = () =>
    downloadDocHtml(
      docRef.current,
      `次第_${sidai.meetingName}`,
      `次第：${sidai.meetingName}`
    );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/sidai" className={styles.navLink}>
          ← 次第一覧
        </Link>
        {can.createSidai && (
          <Link href={`/sidai/${sidaiId}`} className={styles.navLink}>
            編集画面へ →
          </Link>
        )}
        {sidai.distributionId && (
          <Link
            href={`/haishin/${sidai.distributionId}`}
            className={styles.navLink}
          >
            配信データを見る →
          </Link>
        )}
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={onDownload}
          title="この次第を単一 HTML ファイルとして保存（オフラインで開ける／印刷で PDF 化も可）"
        >
          ダウンロード
        </button>
      </div>

      <article ref={docRef} className={styles.doc}>
        <SidaiDoc
          sidai={sidai}
          gianById={(id) => gianStore[id]?.gian ?? null}
          linkGianTo={(id) => `/gian/${id}/view`}
          fixedFileById={(id) =>
            fixedFiles.find((f) => f.id === id) ?? null
          }
          onOpenFixedFile={(id, name) => openFileByIdAsync(id, name)}
        />
      </article>
    </div>
  );
}
