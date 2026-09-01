"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_FILE_BYTES,
  deleteFile,
  getFileBlob,
  putFile,
  openFileAsync,
} from "@/lib/sharedFilesDb";
import { downloadFileAsync } from "@/lib/download";
import { useCommittee } from "@/lib/useOrg";
import { useSharedFiles } from "@/lib/useSharedStore";
import styles from "./CommitteeFolder.module.css";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SharedFolder({
  committeeId,
}: {
  committeeId: string;
}) {
  const found = useCommittee(committeeId);
  const { files, loading } = useSharedFiles(committeeId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  const upload = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setError(null);
    setBusy(true);
    let ok = 0;
    try {
      for (const f of list) {
        try {
          await putFile(committeeId, f);
          ok += 1;
        } catch (e) {
          setError(
            e instanceof Error ? `${f.name}: ${e.message}` : `${f.name}: 追加できませんでした`
          );
        }
      }
      if (ok > 0) {
        setFlash(`${ok} 件のファイルを追加しました`);
        window.setTimeout(() => setFlash(null), 2500);
      }
    } finally {
      setBusy(false);
    }
  };

  const onOpen = (id: string, name: string) => {
    openFileAsync(name, () => getFileBlob(id).then((got) => got?.blob));
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year.label} ／ 委員会 ／ {committee.name} ／ 共有用フォルダ
        </div>
        <h1 className={styles.title}>{committee.name}｜共有用フォルダ</h1>
        <p className={styles.note}>
          出欠確認表・議案化前の下書きなどを自由に置ける場所です。議案システムとしての
          管理（ID・タグ・スナップショット）の対象外。ファイルはこのブラウザ内（IndexedDB）に
          保存されます（1ファイル {Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB まで）。
        </p>
        <Link href={`/committee/${committeeId}`} className={styles.back}>
          ← 委員会フォルダ
        </Link>
      </div>

      {error && <div className={styles.err}>{error}</div>}
      {flash && <div className={styles.flash}>{flash}</div>}

      <div
        className={`${styles.dropzone} ${dragOver ? styles.dropzoneOver : ""}`}
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
        <p className={styles.dropText}>
          {busy
            ? "アップロード中..."
            : "ここにファイルをドラッグ＆ドロップ、または"}
        </p>
        {!busy && (
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => inputRef.current?.click()}
          >
            ＋ ファイルを選択
          </button>
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>読み込み中...</p>
      ) : files.length === 0 ? (
        <p className={styles.empty}>ファイルがありません。</p>
      ) : (
        <ul className={styles.fileList}>
          {files.map((f) => (
            <li key={f.id} className={styles.fileItem}>
              <button
                type="button"
                className={styles.fileNameBtn}
                title="開く（PDF等はタブ表示）"
                onClick={() => onOpen(f.id, f.name)}
              >
                📄 {f.name}
              </button>
              <span className={styles.fileSize}>{fmtSize(f.size)}</span>
              <span className={styles.fileDate}>{fmtDate(f.addedAt)}</span>
              <button
                type="button"
                className={styles.dlBtn}
                title="このファイルを保存"
                onClick={() =>
                  downloadFileAsync(f.name, () =>
                    getFileBlob(f.id).then((got) => got?.blob)
                  )
                }
              >
                ダウンロード
              </button>
              <button
                type="button"
                className={styles.delBtn}
                onClick={() => {
                  if (confirm(`「${f.name}」を削除します。よろしいですか？`)) {
                    deleteFile(f.id);
                  }
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
