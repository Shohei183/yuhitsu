"use client";

import Link from "next/link";
import {
  Committee,
  PERIOD_LABEL,
  Period,
  addCommittee,
  renameCommittee,
  removeCommittee,
} from "@/lib/yearStore";
import { STATUS_LABEL } from "@/lib/mockData";
import { decideReplacement } from "@/lib/gianStore";
import { dismiss as dismissNotifications } from "@/lib/notificationStore";
import { useReplacementNotifications } from "@/lib/useNotifications";
import { listDistributionsFor } from "@/lib/distributionStore";
import { listSidaiFor } from "@/lib/sidaiStore";
import { deleteFixedFile, putFixedFile } from "@/lib/fixedFilesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { useFixedFiles } from "@/lib/useFixedFiles";
import { useGianStore } from "@/lib/useGianStore";
import { useDistributionStore } from "@/lib/useDistributionStore";
import { useSidaiStore } from "@/lib/useSidaiStore";
import { useTemplate } from "@/lib/useTemplateStore";
import { useActiveYear, useCan } from "@/lib/useOrg";
import { setPeriod } from "@/lib/activeViewStore";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./YearHome.module.css";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PERIODS: Period[] = ["planned", "live"];

export default function YearHome() {
  const year = useActiveYear();
  const can = useCan();

  if (!year) {
    return (
      <main className={styles.wrap}>
        <p>年度フォルダが見つかりません。</p>
      </main>
    );
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>LOM ／ 年度フォルダ</div>
        <h1 className={styles.title}>{year.label}</h1>
        <p className={styles.sub}>
          {year.plannedPeriodLabel} ／ {year.livePeriodLabel}
          （上部の年度タブで年度を切り替え）
        </p>
      </div>

      {can.approveReplacement && <ReplacementNotifications />}

      <FixedFilesSection yearId={year.id} canEdit={can.manageFixedFiles} />
      {can.editTemplates && (
        <TemplateSection yearId={year.id} canEdit={can.editTemplates} />
      )}
      <CommitteesSection
        yearId={year.id}
        committees={year.committees}
        canEdit={can.editCommittees}
      />
      <PeriodsSection yearId={year.id} canCreate={can.createSidai} />
    </main>
  );
}

/* ── 固定ファイル（IndexedDB アップロード）───────────── */

function FixedFilesSection({
  yearId,
  canEdit,
}: {
  yearId: string;
  canEdit: boolean;
}) {
  const { files, loading } = useFixedFiles(yearId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of arr) {
        try {
          await putFixedFile(yearId, f);
        } catch (e) {
          setError(
            e instanceof Error
              ? `${f.name}: ${e.message}`
              : `${f.name}: 追加できませんでした`
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>固定ファイル</h2>
        <span className={styles.sectionNote}>
          JC規約・議事法・当年度スローガン等（上程フローを経ない常設ライブラリ・このブラウザ内に保存）
        </span>
      </div>

      {error && <div className={styles.err}>{error}</div>}

      {canEdit && (
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
          <span className={styles.dropText}>
            {busy ? "アップロード中..." : "ここにファイルをドラッグ＆ドロップ、または"}
          </span>
          {!busy && (
            <button
              type="button"
              className={styles.miniBtnPrimary}
              onClick={() => inputRef.current?.click()}
            >
              ＋ ファイルを選択
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className={styles.emptyLine}>読み込み中...</p>
      ) : files.length === 0 ? (
        <p className={styles.emptyLine}>ファイルがありません。</p>
      ) : (
        <ul className={styles.fileList}>
          {files.map((f) => (
            <li key={f.id} className={styles.fileItem}>
              <button
                type="button"
                className={styles.fileLink}
                title="開く（PDF等はタブ表示）"
                onClick={() => openFileByIdAsync(f.id, f.name)}
              >
                📄 {f.name}
              </button>
              <span className={styles.fileNote}>{fmtSize(f.size)}</span>
              {canEdit && (
                <button
                  type="button"
                  className={styles.miniBtn}
                  onClick={() => {
                    if (confirm(`「${f.name}」を削除します。よろしいですか？`)) {
                      deleteFixedFile(f.id);
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

      {canEdit && (
        <p className={styles.addHint}>形式・容量の制限はありません</p>
      )}
    </section>
  );
}

/* ── 議案・次第テンプレート ─────────────────────── */

function TemplateSection({
  yearId,
  canEdit,
}: {
  yearId: string;
  canEdit: boolean;
}) {
  const tpl = useTemplate(yearId);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>議案・次第テンプレート</h2>
        <span className={styles.sectionNote}>
          固定ファイルから分離。項目の型を管理します
        </span>
      </div>
      <div className={styles.tplRow}>
        <div className={styles.tplCard}>
          <div className={styles.tplName}>協議テンプレート</div>
          <div className={styles.tplMeta}>
            事業要綱 {tpl.kyogi.outline.length} 項目 ／ 事業概要{" "}
            {tpl.kyogi.overview.length} 項目
          </div>
        </div>
        <div className={styles.tplCard}>
          <div className={styles.tplName}>審議テンプレート</div>
          <div className={styles.tplMeta}>
            事業要綱 {tpl.shingi.outline.length} 項目 ／ 事業概要{" "}
            {tpl.shingi.overview.length} 項目
          </div>
        </div>
        <div className={styles.tplCard}>
          <div className={styles.tplName}>決算協議テンプレート</div>
          <div className={styles.tplMeta}>
            事業要綱 {tpl.kessanKyogi.outline.length} 項目 ／ 事業概要{" "}
            {tpl.kessanKyogi.overview.length} 項目
          </div>
        </div>
        <div className={styles.tplCard}>
          <div className={styles.tplName}>決算審議テンプレート</div>
          <div className={styles.tplMeta}>
            事業要綱 {tpl.kessanShingi.outline.length} 項目 ／ 事業概要{" "}
            {tpl.kessanShingi.overview.length} 項目
          </div>
        </div>
        <div className={styles.tplCard}>
          <div className={styles.tplName}>次第テンプレート</div>
          <div className={styles.tplMeta}>
            区分 {tpl.sidaiSections.length}：
            {tpl.sidaiSections.map((s) => s.label).join(" ／ ")}
          </div>
        </div>
      </div>
      <Link href="/templates" className={styles.tplLink}>
        {canEdit ? "テンプレートを編集する →" : "テンプレートを見る →"}
      </Link>
    </section>
  );
}

/* ── 委員会 ─────────────────────────────────── */

function CommitteesSection({
  yearId,
  committees,
  canEdit,
}: {
  yearId: string;
  committees: Committee[];
  canEdit: boolean;
}) {
  const gianStore = useGianStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    addCommittee(yearId, name);
    setNewName("");
    setAdding(false);
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>委員会</h2>
        <span className={styles.sectionNote}>
          各委員会フォルダ（議案構築／共有用フォルダ）
        </span>
      </div>
      <div className={styles.committeeGrid}>
        {committees.map((c) => {
          const gians = c.gianIds
            .map((gid) => gianStore[gid]?.gian)
            .filter((g): g is NonNullable<typeof g> => !!g);
          return (
            <div key={c.id} className={styles.committeeCell}>
              <Link
                href={`/committee/${c.id}`}
                className={styles.committeeCard}
              >
                <div className={styles.committeeName}>📁 {c.name}</div>
                <div className={styles.committeeMeta}>
                  議案 {gians.length} 件
                  {gians.length > 0 &&
                    `（${gians.map((g) => `${g.kind}${STATUS_LABEL[g.status]}`).join("・")}）`}
                </div>
                <div className={styles.committeeSub}>
                  議案構築 ／ 共有用フォルダ →
                </div>
              </Link>
              {canEdit && (
                <div className={styles.committeeActions}>
                  <button
                    type="button"
                    className={styles.renameBtn}
                    onClick={() => {
                      const next = prompt("委員会フォルダの名称", c.name);
                      if (next && next.trim() && next.trim() !== c.name) {
                        renameCommittee(c.id, next);
                      }
                    }}
                  >
                    名称変更
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={async () => {
                      if (
                        !confirm(
                          `委員会「${c.name}」を削除します。よろしいですか？`
                        )
                      )
                        return;
                      const res = await removeCommittee(c.id);
                      if (!res.ok) alert(res.error ?? "削除できませんでした");
                    }}
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit &&
        (adding ? (
          <div className={styles.addRow}>
            <input
              autoFocus
              className={styles.addInput}
              placeholder="委員会名（例：会員拡大委員会）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
            />
            <button
              type="button"
              className={styles.miniBtnPrimary}
              onClick={submitNew}
            >
              追加
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.miniBtnPrimary}
            style={{ marginTop: 10 }}
            onClick={() => setAdding(true)}
          >
            ＋ 委員会を追加
          </button>
        ))}
    </section>
  );
}

/* ── 差し替え申請の通知（approveReplacement 保持者のみ）──────── */

function ReplacementNotifications() {
  const notices = useReplacementNotifications();
  if (notices.length === 0) return null;

  return (
    <section className={`${styles.section} ${styles.notifSection}`}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>差し替え申請の通知（{notices.length}）</h2>
        <button
          type="button"
          className={styles.miniBtn}
          onClick={() =>
            dismissNotifications(...notices.map((n) => n.request.id))
          }
        >
          すべてクリア
        </button>
      </div>
      <ul className={styles.notifList}>
        {notices.map((n) => (
          <li key={n.request.id} className={styles.notifItem}>
            <div className={styles.notifBody}>
              <Link href={`/gian/${n.gianId}`} className={styles.notifLink}>
                {n.committee}／{n.gianKind}「{n.gianTopic}」
              </Link>
              {n.request.note && (
                <div className={styles.notifNote}>{n.request.note}</div>
              )}
              <div className={styles.notifMeta}>
                {new Date(n.request.requestedAt).toLocaleString("ja-JP")}
              </div>
            </div>
            <div className={styles.notifActions}>
              <button
                type="button"
                className={styles.approveBtn}
                onClick={() => {
                  if (
                    confirm(
                      "この差し替え申請を承認します。議案は「編集中」に戻り、担当者が修正できるようになります。よろしいですか？"
                    )
                  ) {
                    decideReplacement(n.gianId, n.request.id, true);
                    dismissNotifications(n.request.id);
                  }
                }}
              >
                承認（編集可に戻す）
              </button>
              <button
                type="button"
                className={styles.rejectBtn}
                onClick={() => {
                  if (confirm("この差し替え申請を却下します。よろしいですか？")) {
                    decideReplacement(n.gianId, n.request.id, false);
                    dismissNotifications(n.request.id);
                  }
                }}
              >
                却下
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => dismissNotifications(n.request.id)}
              >
                通知だけ消す
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 予定者期間 / 本年度（配信）───────────── */

function PeriodsSection({
  yearId,
  canCreate,
}: {
  yearId: string;
  canCreate: boolean;
}) {
  useSidaiStore();
  useDistributionStore();
  const router = useRouter();

  const goSidai = (p: Period) => {
    setPeriod(p);
    router.push("/sidai");
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>期間と配信</h2>
        <span className={styles.sectionNote}>
          配信（理事会・三役会の各回）は予定者期間／本年度それぞれで独立管理。
          どちらの期間でも次第を作成できます。
        </span>
      </div>
      <div className={styles.committeeGrid}>
        {PERIODS.map((p) => {
          const sidais = listSidaiFor(yearId, p);
          const dists = listDistributionsFor(yearId, p);
          return (
            <div key={p} className={styles.committeeCell}>
              <Link
                href="/sidai"
                className={styles.committeeCard}
                onClick={() => setPeriod(p)}
              >
                <div className={styles.committeeName}>
                  📦 {PERIOD_LABEL[p]}の次第・配信
                </div>
                <div className={styles.committeeMeta}>
                  次第 {sidais.length} 件 ／ 配信データ {dists.length} 件
                </div>
                <div className={styles.committeeSub}>次第一覧・配信データ →</div>
              </Link>
              {canCreate && (
                <button
                  type="button"
                  className={styles.renameBtn}
                  onClick={() => goSidai(p)}
                >
                  次第作成
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
