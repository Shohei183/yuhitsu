"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useActiveYear, useCan } from "@/lib/useOrg";
import { useMinutes } from "@/lib/useMinutes";
import { deleteMinutes, putMinutes } from "@/lib/minutesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { formatJaDate, formatJaDateTime } from "@/lib/format";
import styles from "./MinutesFolder.module.css";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 議事録フォルダ：議事録を提出し、提出済みを新しい順に一覧で見る。 */
export default function MinutesFolder() {
  const year = useActiveYear();
  const can = useCan();
  const yearId = year?.id ?? "";
  const canSubmit = can.editGian || can.manageFixedFiles;
  const { files, loading } = useMinutes(yearId);

  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of arr) {
        try {
          await putMinutes(yearId, f);
        } catch (e) {
          setError(
            e instanceof Error
              ? `${f.name}: ${e.message}`
              : `${f.name}: 提出できませんでした`
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (!year) {
    return (
      <main className={styles.wrap}>
        <p className={styles.empty}>年度フォルダが見つかりません。</p>
      </main>
    );
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>{year.label} ／ 議事録フォルダ</div>
        <h1 className={styles.title}>議事録フォルダ</h1>
        <Link prefetch={false} href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      {canSubmit && (
        <section className={styles.card}>
          <h2 className={styles.h2}>議事録を提出する</h2>
          {error && <div className={styles.err}>{error}</div>}
          <div
            className={`${styles.dz} ${dragOver ? styles.dzOver : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              upload(e.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) upload(e.target.files);
                e.target.value = "";
              }}
            />
            <span className={styles.dzText}>
              {busy ? "提出中..." : "ここにファイルをドラッグ＆ドロップ、または"}
            </span>
            {!busy && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => inputRef.current?.click()}
              >
                ＋ ファイルを選択して提出
              </button>
            )}
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.h2}>提出された議事録</h2>
        {loading ? (
          <p className={styles.empty}>読み込み中...</p>
        ) : files.length === 0 ? (
          <p className={styles.empty}>提出された議事録はまだありません。</p>
        ) : (
          <ul className={styles.files}>
            {files.map((f) => (
              <li key={f.id} className={styles.file}>
                <button
                  type="button"
                  className={styles.fileLink}
                  title="開く（PDF等はタブ表示）"
                  onClick={() => openFileByIdAsync(f.id, f.name)}
                >
                  📄 {f.name}
                </button>
                <span
                  className={styles.fileMeta}
                  title={`提出日時 ${formatJaDateTime(f.addedAt)}`}
                >
                  {fmtSize(f.size)}　提出 {formatJaDate(f.addedAt)}
                </span>
                {canSubmit && (
                  <button
                    type="button"
                    className={styles.del}
                    onClick={() => {
                      if (confirm(`「${f.name}」を削除します。よろしいですか？`)) {
                        deleteMinutes(f.id);
                      }
                    }}
                  >
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
