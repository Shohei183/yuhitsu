"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SyncLab as Lab, LabRow, resetSyncLab } from "@/lib/syncLab";
import { toHalfWidth } from "@/lib/format";
import styles from "./SyncLab.module.css";

const ASSIGNEES = ["", "理事長", "専務理事", "事務局長", "議長", "監事"];

function ts(at: number): string {
  return new Date(at).toLocaleTimeString("ja-JP");
}

export default function SyncLab() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const l = new Lab();
    setLab(l);
    const unsub = l.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsub();
      l.destroy();
    };
  }, []);

  if (!lab) {
    return (
      <main className={styles.wrap}>
        <p className={styles.note}>読み込み中…</p>
      </main>
    );
  }

  const rows: LabRow[] = lab.snapshot();
  const connected = lab.isConnected();
  const pending = lab.pendingCount();
  const log = lab.getLog();

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>実験 ／ オフライン編集 × 同期（Yjs / CRDT）</div>
        <h1 className={styles.title}>同期ラボ</h1>
        <p className={styles.note}>
          クラウドを使わずに CRDT 同期を試す実験ページです。伝送は{" "}
          <code>BroadcastChannel</code>（同一ブラウザの別タブ間）、永続化は{" "}
          <code>IndexedDB</code>。本番の次第データ（localStorage）には影響しません。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      <section className={styles.guide}>
        <div className={styles.guideTitle}>試し方</div>
        <ol>
          <li>
            このページ（<code>/sync-lab</code>）を <strong>2つのタブ</strong>{" "}
            で開く
          </li>
          <li>
            両方で行を追加・編集 → 互いに<strong>即座に反映</strong>される（CRDT）
          </li>
          <li>
            片方のタブで <strong>「切断」</strong> → 両方のタブで別々に編集（同じ行の同じ欄でも）
          </li>
          <li>
            <strong>「再接続」</strong> → オフライン中の変更が
            <strong>自動でマージ</strong>される（削除・並べ替え・文字編集が競合しても破綻しない）
          </li>
        </ol>
      </section>

      <section className={styles.bar}>
        <span className={styles.client}>
          このタブ：<strong>{lab.clientTag}</strong>
        </span>
        <span
          className={`${styles.status} ${
            connected ? styles.online : styles.offline
          }`}
        >
          {connected ? "● 接続中" : "● 切断（オフライン）"}
        </span>
        {!connected && pending > 0 && (
          <span className={styles.pending}>未送信の変更 {pending} 件</span>
        )}
        <button
          type="button"
          className={connected ? styles.btnGhost : styles.btnPrimary}
          onClick={() => lab.toggle()}
        >
          {connected ? "切断する" : "再接続する"}
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => lab.addRow()}
        >
          ＋ 行を追加
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => {
            if (confirm("この実験の全行を削除します（相手にも反映されます）。")) {
              lab.clearRows();
            }
          }}
        >
          全削除
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={async () => {
            if (
              confirm(
                "IndexedDB の実験データも消して初期化します。ページを再読み込みします。"
              )
            ) {
              lab.destroy();
              await resetSyncLab();
              location.reload();
            }
          }}
        >
          実験データを初期化
        </button>
      </section>

      <div className={styles.cols}>
        <section className={styles.rowsCol}>
          <div className={styles.colTitle}>次第の行（{rows.length}）</div>
          {rows.length === 0 ? (
            <p className={styles.empty}>行がありません。「＋ 行を追加」から。</p>
          ) : (
            <ul className={styles.rows}>
              {rows.map((r, i) => (
                <li key={r.id} className={styles.row}>
                  <input
                    className={styles.time}
                    value={r.time}
                    placeholder="時刻"
                    inputMode="numeric"
                    onChange={(e) =>
                      lab.updateRow(r.id, "time", toHalfWidth(e.target.value))
                    }
                  />
                  <input
                    className={styles.titleInput}
                    value={r.title}
                    placeholder="項目名"
                    onChange={(e) =>
                      lab.updateRow(r.id, "title", e.target.value)
                    }
                  />
                  <select
                    className={styles.assignee}
                    value={r.assignee}
                    onChange={(e) =>
                      lab.updateRow(r.id, "assignee", e.target.value)
                    }
                  >
                    {ASSIGNEES.map((a) => (
                      <option key={a || "none"} value={a}>
                        {a || "担当者（未選択）"}
                      </option>
                    ))}
                  </select>
                  <span className={styles.ctrls}>
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => lab.moveRow(r.id, "up")}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={i === rows.length - 1}
                      onClick={() => lab.moveRow(r.id, "down")}
                    >
                      ▼
                    </button>
                    <button type="button" onClick={() => lab.removeRow(r.id)}>
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.logCol}>
          <div className={styles.colTitle}>同期ログ</div>
          {log.length === 0 ? (
            <p className={styles.empty}>まだイベントはありません。</p>
          ) : (
            <ul className={styles.log}>
              {log.map((e) => (
                <li key={e.id}>
                  <span className={styles.logAt}>{ts(e.at)}</span>
                  {e.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
