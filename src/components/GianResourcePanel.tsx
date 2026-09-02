"use client";

import { useRef, useState } from "react";
import {
  GianFileCategory,
  GIAN_FILE_CATEGORY_LABEL,
  deleteGianFile,
  putGianFile,
} from "@/lib/gianFilesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { useGianFiles } from "@/lib/useGianFiles";
import styles from "./GianResourcePanel.module.css";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function GianResourcePanel({
  gianId,
  category,
  editable,
}: {
  gianId: string;
  category: GianFileCategory;
  editable: boolean;
}) {
  const { files, loading } = useGianFiles(gianId, category);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of list) {
        try {
          await putGianFile(gianId, category, f);
        } catch (e) {
          setError(
            e instanceof Error ? `${f.name}: ${e.message}` : `${f.name}: 追加できませんでした`
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onOpen = (id: string, name: string) => {
    openFileByIdAsync(id, name);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{GIAN_FILE_CATEGORY_LABEL[category]}</span>
        <span className={styles.count}>{files.length}</span>
      </div>

      {error && <div className={styles.err}>{error}</div>}

      {editable && (
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
            {busy ? "アップロード中..." : "D&D または"}
          </span>
          {!busy && (
            <button
              type="button"
              className={styles.selectBtn}
              onClick={() => inputRef.current?.click()}
            >
              ファイルを選択
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className={styles.empty}>読み込み中...</p>
      ) : files.length === 0 ? (
        <p className={styles.empty}>ファイルなし</p>
      ) : (
        <ul className={styles.list}>
          {files.map((f) => (
            <li key={f.id} className={styles.item}>
              <button
                type="button"
                className={styles.name}
                title="開く（PDF等はタブ表示）"
                onClick={() => onOpen(f.id, f.name)}
              >
                📄 {f.name}
              </button>
              <span className={styles.size}>{fmtSize(f.size)}</span>
              {editable && (
                <button
                  type="button"
                  className={styles.del}
                  title="削除"
                  onClick={() => {
                    if (confirm(`「${f.name}」を削除します。よろしいですか？`)) {
                      deleteGianFile(f.id);
                    }
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <p className={styles.hint}>
          形式・容量制限なし
        </p>
      )}
    </div>
  );
}
