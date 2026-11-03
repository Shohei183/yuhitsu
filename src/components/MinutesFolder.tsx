"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useActiveYear, useCan } from "@/lib/useOrg";
import { useSidaiStore } from "@/lib/useSidaiStore";
import { useMinutes } from "@/lib/useMinutes";
import { deleteMinutes, otherKey, putMinutes } from "@/lib/minutesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { PERIOD_LABEL } from "@/lib/yearStore";
import { formatJaDate, formatJaDateTime } from "@/lib/format";
import styles from "./MinutesFolder.module.css";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 議事録フォルダ：会議（次第）を選んで議事録を提出し、過去の提出分を一覧で見る。
 * 次第を選ばない分は「その他」にまとめる。
 */
export default function MinutesFolder() {
  const year = useActiveYear();
  const can = useCan();
  const sidaiStore = useSidaiStore();

  const yearId = year?.id ?? "";
  const canSubmit = can.editGian || can.manageFixedFiles;

  // この年度の会議（次第）を、開催日時の新しい順に
  const meetings = useMemo(
    () =>
      Object.values(sidaiStore)
        .filter((s) => s.yearId === yearId)
        .sort((a, b) =>
          (b.datetime || b.createdAt).localeCompare(a.datetime || a.createdAt)
        ),
    [sidaiStore, yearId]
  );
  const other = otherKey(yearId);
  const keys = useMemo(
    () => (yearId ? [...meetings.map((m) => m.id), other] : []),
    [meetings, other, yearId]
  );
  const { files, loading } = useMinutes(keys);

  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submittedKeys = new Set(files.map((f) => f.meetingKey));
  // 未選択のときは、議事録がまだ出ていない最新の会議を選んでおく
  const defaultKey =
    meetings.find((m) => !submittedKeys.has(m.id))?.id ??
    meetings[0]?.id ??
    other;
  const selected = keys.includes(target) ? target : defaultKey;

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of arr) {
        try {
          await putMinutes(selected, f);
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

  const labelOf = (key: string): string => {
    if (key === other) return "その他（会議を選ばない）";
    const m = sidaiStore[key];
    return m ? m.meetingName : "（削除された次第）";
  };

  const groups = [...meetings.map((m) => m.id), other]
    .map((key) => ({
      key,
      sidai: sidaiStore[key],
      items: files
        .filter((f) => f.meetingKey === key)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    }))
    .filter((g) =>
      onlyMissing ? g.items.length === 0 && !!g.sidai : g.items.length > 0
    );

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
        <p className={styles.note}>
          会議ごとに議事録を提出します。過去に提出された議事録は、下の一覧からいつでも開けます。
        </p>
        <Link prefetch={false} href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      <section className={styles.card}>
        <h2 className={styles.h2}>議事録を提出する</h2>
        {canSubmit ? (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>会議</span>
              <select
                className={styles.select}
                value={selected}
                onChange={(e) => setTarget(e.target.value)}
              >
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meetingName}（{PERIOD_LABEL[m.period]}
                    {m.datetime ? `・${m.datetime}` : ""}）
                    {submittedKeys.has(m.id) ? "　提出済み" : ""}
                  </option>
                ))}
                <option value={other}>その他（会議を選ばない）</option>
              </select>
            </label>
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
                {busy
                  ? "提出中..."
                  : `「${labelOf(selected)}」の議事録をここにドラッグ＆ドロップ、または`}
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
            <p className={styles.hint}>
              形式・容量の制限はありません。同じ会議に複数ファイルを提出できます。
            </p>
          </>
        ) : (
          <p className={styles.empty}>議事録の提出には編集権限が必要です。</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h2 className={styles.h2}>提出済みの議事録</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            未提出の会議だけ表示
          </label>
        </div>

        {loading ? (
          <p className={styles.empty}>読み込み中...</p>
        ) : groups.length === 0 ? (
          <p className={styles.empty}>
            {onlyMissing
              ? "議事録が未提出の会議はありません。"
              : "提出された議事録はまだありません。"}
          </p>
        ) : (
          <ul className={styles.groups}>
            {groups.map((g) => (
              <li key={g.key} className={styles.group}>
                <div className={styles.groupHead}>
                  <span className={styles.groupName}>📁 {labelOf(g.key)}</span>
                  {g.sidai && (
                    <span className={styles.groupMeta}>
                      {PERIOD_LABEL[g.sidai.period]}
                      {g.sidai.datetime ? `　${g.sidai.datetime}` : ""}
                    </span>
                  )}
                  {g.sidai && (
                    <Link
                      prefetch={false}
                      href={`/sidai/${g.key}/view`}
                      className={styles.groupLink}
                    >
                      次第を見る
                    </Link>
                  )}
                </div>
                {g.items.length === 0 ? (
                  <p className={styles.missing}>議事録は未提出です。</p>
                ) : (
                  <ul className={styles.files}>
                    {g.items.map((f) => (
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
                              if (
                                confirm(
                                  `「${f.name}」を削除します。よろしいですか？`
                                )
                              ) {
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
