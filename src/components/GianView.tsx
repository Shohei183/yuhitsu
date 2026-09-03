"use client";

import Link from "next/link";
import { Fragment, ReactNode, useRef } from "react";
import { BudgetLine, Gian, STATUS_LABEL, getGian } from "@/lib/mockData";
import { formatDocNumbers, formatJaDateTime, jpNum, sumAmounts } from "@/lib/format";
import { useLomName } from "@/lib/useSettingsStore";
import { downloadDocHtml } from "@/lib/download";
import {
  GianFileCategory,
  GIAN_FILE_CATEGORY_LABEL,
  GianFileMeta,
} from "@/lib/gianFilesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { useGianFiles } from "@/lib/useGianFiles";
import { isKihon, showsPriorFeedback } from "@/lib/gianStore";
import { useGianEntry } from "@/lib/useGianStore";
import { useBudgetStore } from "@/lib/useBudgetStore";
import { budgetForGian, sectionTotal } from "@/lib/budgetStore";
import { useCommitteeOfGian } from "@/lib/useOrg";
import styles from "./GianView.module.css";

const SCHEDULE_LABEL = "実施までのスケジュール";
const BUDGET_LABEL = "予算総額";

/** 配信データの凍結時点の資料メタ（実体はパッケージには含めない） */
export interface FrozenGianFiles {
  review: GianFileMeta[];
  reference: GianFileMeta[];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function GianView({
  gianId,
  gian: gianProp,
  snapshotId,
  embedded,
  anchorId,
  frozenFiles,
  toolbar,
}: {
  gianId?: string;
  /** 議案を直接渡す場合（配信データの凍結コピーなど） */
  gian?: Gian;
  snapshotId?: string;
  /** 埋め込み表示：ページ枠・ツールバーを省く */
  embedded?: boolean;
  anchorId?: string;
  /** 配信データ画面など、確定時点の資料メタを直接渡す場合 */
  frozenFiles?: FrozenGianFiles;
  /** 標準ツールバーの代わりに表示するツールバー（フル doc 表示のまま差し替え） */
  toolbar?: ReactNode;
}) {
  const entry = useGianEntry(gianId ?? "");
  const committeeInfo = useCommitteeOfGian(gianId ?? "");
  const docRef = useRef<HTMLElement>(null);
  useBudgetStore();
  const lom = useLomName();
  const linkedBudget = gianId ? budgetForGian(gianId) : undefined;

  const snap =
    snapshotId && entry
      ? entry.snapshots.find((s) => s.id === snapshotId)
      : null;
  const gian: Gian | undefined = gianProp ?? snap?.gian ?? entry?.gian;

  if (!gian) {
    return (
      <div className={styles.page}>
        <div className={styles.doc}>
          <p>議案が見つかりません。</p>
          <Link href="/">← 議案一覧へ</Link>
        </div>
      </div>
    );
  }

  const showPriorFeedback =
    showsPriorFeedback(gian.kind) && gian.priorFeedback.length > 0;
  const kihon = isKihon(gian.kind);

  const kindLabel = kihon ? "基本方針" : `${gian.kind}議案`;
  const onDownload = () => {
    void downloadDocHtml(
      docRef.current,
      `${kindLabel}_${gian.topic}`,
      `${kindLabel}：${gian.topic}`
    ).catch((e) => console.error("[議案] ダウンロード失敗:", e));
  };

  const body = (
    <article
      ref={docRef}
      id={anchorId}
      className={`${styles.doc} ${embedded ? styles.docEmbedded : ""}`}
    >
        <header className={styles.docHead}>
          <div className={styles.lom}>{gian.lomName || lom}</div>
          {!kihon && (
            <div className={styles.meeting}>
              {gian.submissionMeeting}提案議題
            </div>
          )}
        </header>

        <h1 className={styles.topic}>{gian.topic}</h1>

        {kihon ? (
          <>
            <div className={styles.subLabel}>● 配属メンバー</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.dateCol}>役職</th>
                    <th>氏名</th>
                  </tr>
                </thead>
                <tbody>
                  {(gian.assignedMembers ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className={styles.empty}>
                        （未記入）
                      </td>
                    </tr>
                  ) : (
                    (gian.assignedMembers ?? []).map((m) => (
                      <tr key={m.id}>
                        <td>{m.role || "—"}</td>
                        <td>{m.name || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p className={styles.proposalLine}>
              表記議題について以下の明細をもって{" "}
              <strong>{gian.proposalType}</strong> として提案します。
            </p>
            <p className={styles.proposalMeta}>
              {gian.proposalDate}
              <br />
              {gian.proposerRole}　{gian.proposerName}
            </p>

            <dl className={styles.kvList}>
              <Kv label="文書作成者" value={gian.author} />
              <Kv label="作成日時" value={gian.createdAt} />
              <Kv label="礼状の発送" value={gian.courtesyLetter} />
              <Kv label="メディア依頼書" value={gian.mediaRequest} />
              <Kv
                label="担当副理事長 確認日"
                value={gian.vpConfirmDate || "未確認"}
              />
            </dl>
          </>
        )}

        {!kihon && (
          <>
            <div className={styles.subLabel}>● 議案上程スケジュール</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>回数</th>
                    <th>上程会議名</th>
                    <th>会議開催日時</th>
                    <th>上程形式</th>
                  </tr>
                </thead>
                <tbody>
                  {gian.submissionSchedule.map((r, i) => (
                    <tr key={i}>
                      <td>{r.round}</td>
                      <td>{r.meeting}</td>
                      <td>{r.date}</td>
                      <td>{r.format}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className={styles.h2}>{kihon ? "基本方針" : "事業要綱"}</h2>
        <ol className={styles.itemList}>
          {gian.outline.map((it) => (
            <li
              key={it.no}
              data-note-item={`outline-${it.no}`}
              data-note-label={`${kihon ? "基本方針" : "事業要綱"} ${it.no}. ${it.label}`}
            >
              <div className={styles.itemLabel}>
                {it.no}. {it.label}
              </div>
              <Body text={it.body} />
            </li>
          ))}
        </ol>

        <h2 className={styles.h2}>{kihon ? "事業計画" : "事業概要"}</h2>
        {kihon ? (
          <ol className={styles.itemList}>
            {gian.overview.length === 0 && (
              <li>
                <span className={styles.empty}>（未記入）</span>
              </li>
            )}
            {gian.overview.map((it) => (
              <li
                key={it.no}
                data-note-item={`overview-${it.no}`}
                data-note-label={`事業計画 ${it.no}. ${it.label || "（事業名なし）"}`}
              >
                <div className={styles.itemLabel}>
                  {it.no}. {it.label || "（事業名なし）"}
                </div>
                <div className={styles.planViewLink}>
                  関連議案（協議）：
                  {it.linkedGianId ? (
                    <PlanLink gianId={it.linkedGianId} />
                  ) : (
                    <span className={styles.empty}>（なし）</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <ol className={styles.itemList}>
            {gian.overview.map((it) => (
              <li
                key={it.no}
                data-note-item={`overview-${it.no}`}
                data-note-label={`事業概要 ${it.no}. ${it.label}`}
              >
                <div className={styles.itemLabel}>
                  {it.no}. {it.label}
                </div>
                {it.label === SCHEDULE_LABEL ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.dateCol}>日付</th>
                          <th>内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gian.implementationSchedule.length === 0 ? (
                          <tr>
                            <td colSpan={2} className={styles.empty}>
                              （未記入）
                            </td>
                          </tr>
                        ) : (
                          gian.implementationSchedule.map((e) => (
                            <tr key={e.id}>
                              <td>{e.date || "—"}</td>
                              <td>
                                {e.content ? formatDocNumbers(e.content) : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Body text={it.body} />
                )}
                {it.label === BUDGET_LABEL && linkedBudget && (
                  <a
                    href={`/budget/${linkedBudget.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.budgetLink}
                  >
                    💰 事業収支予算書（費用計 ¥
                    {jpNum(sectionTotal(linkedBudget.expense))}） ↗
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}

        {kihon && (
          <>
            <h2 className={styles.h2}>事業予定</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.dateCol}>時期</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                  {gian.implementationSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={2} className={styles.empty}>
                        （未記入）
                      </td>
                    </tr>
                  ) : (
                    gian.implementationSchedule.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date || "—"}</td>
                        <td>{e.content ? formatDocNumbers(e.content) : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {kihon && gian.committeeBudget && (
          <>
            <h2 className={styles.h2}>委員会予算</h2>
            <div className={styles.budgetGrid}>
              <BudgetColumn
                title="収入の部"
                lines={gian.committeeBudget.income}
              />
              <BudgetColumn
                title="支出の部"
                lines={gian.committeeBudget.expense}
              />
            </div>
          </>
        )}

        {showPriorFeedback && (
          <>
            <h2 className={styles.h2}>前回までの流れ（意見と対応）</h2>
            {gian.priorFeedback.map((round) => (
              <div
                key={round.id}
                className={styles.fbRound}
                data-note-item={`prior-${round.id}`}
                data-note-label={`前回までの流れ：${round.meetingName}`}
              >
                <div className={styles.fbHead}>
                  ● {round.meetingName}　{round.date}　{round.format}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {round.exchanges.map((ex, i) => (
                        <Fragment key={ex.id}>
                          <tr>
                            <th className={styles.fbCol}>意見 {i + 1}</th>
                            <td>
                              <Body text={ex.opinion} inline />
                            </td>
                          </tr>
                          <tr>
                            <th className={styles.fbCol}>対応 {i + 1}</th>
                            <td>
                              <Body text={ex.response} inline />
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}

        <h2 className={styles.h2}>資料</h2>
        {frozenFiles ? (
          <>
            <FrozenResourceList
              category="review"
              files={frozenFiles.review}
            />
            <FrozenResourceList
              category="reference"
              files={frozenFiles.reference}
            />
          </>
        ) : gianId ? (
          <>
            <LiveResourceList gianId={gianId} category="review" />
            <LiveResourceList gianId={gianId} category="reference" />
          </>
        ) : (
          <p className={styles.empty}>（なし）</p>
        )}
    </article>
  );

  if (embedded && !toolbar) return body;

  const docButtons = (
    <>
      <button
        type="button"
        className={styles.downloadBtn}
        onClick={onDownload}
        title="この議案を単一 HTML ファイルとして保存（オフラインで開ける／印刷で PDF 化も可）"
      >
        ダウンロード
      </button>
      <button
        type="button"
        className={styles.pdfBtn}
        onClick={() => window.print()}
        title="A4サイズで PDF 出力（ブラウザの印刷 →「PDFに保存」）"
      >
        PDF出力（A4）
      </button>
    </>
  );

  return (
    <div className={styles.page}>
      {toolbar ? (
        <div className={styles.toolbar}>
          {toolbar}
          {docButtons}
        </div>
      ) : (
        <div className={styles.toolbar}>
          <Link
            href={
              committeeInfo
                ? `/committee/${committeeInfo.committee.id}/gian`
                : "/"
            }
            className={styles.navLink}
          >
            ← 議案一覧
          </Link>
          {gianId && (
            <Link href={`/gian/${gianId}`} className={styles.navLink}>
              編集画面へ →
            </Link>
          )}
          {docButtons}
          <span className={`${styles.badge} ${styles[gian.status]}`}>
            {STATUS_LABEL[gian.status]}
          </span>
          {snap && (
            <span className={styles.snapTag}>
              スナップショット表示：{snap.reason}（{fmt(snap.takenAt)}）
            </span>
          )}
        </div>
      )}
      {body}
    </div>
  );
}

const fmt = formatJaDateTime;

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kv}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function Body({ text, inline }: { text: string; inline?: boolean }) {
  if (text.trim() === "") {
    return <span className={styles.empty}>（未記入）</span>;
  }
  return (
    <div className={inline ? styles.bodyInline : styles.itemBody}>
      {formatDocNumbers(text)}
    </div>
  );
}

/** 委員会予算の 1 カラム（収入の部／支出の部）。合計は入力額から自動計算 */
function BudgetColumn({
  title,
  lines,
}: {
  title: string;
  lines: BudgetLine[];
}) {
  const total = sumAmounts(lines);
  return (
    <div className={styles.budgetCol}>
      <div className={styles.budgetColTitle}>{title}</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>科目</th>
              <th className={styles.dateCol}>金額</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={2} className={styles.empty}>
                  （未記入）
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.label || "—"}</td>
                  <td>{l.amount || "—"}</td>
                </tr>
              ))
            )}
            <tr className={styles.budgetTotalRow}>
              <td>合計</td>
              <td>￥{jpNum(total)}-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 基本方針「事業計画」項目からリンクされた議案への遷移チップ（別タブ） */
function PlanLink({ gianId }: { gianId: string }) {
  const entry = useGianEntry(gianId);
  const g = entry?.gian ?? getGian(gianId);
  return (
    <a
      href={`/gian/${gianId}/view`}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.planLink}
    >
      🔗 {g ? g.topic : "関連議案"} ↗
    </a>
  );
}

/** 現在アップロードされている資料（IndexedDB）。名前クリックでダウンロード。 */
function LiveResourceList({
  gianId,
  category,
}: {
  gianId: string;
  category: GianFileCategory;
}) {
  const { files, loading } = useGianFiles(gianId, category);
  return (
    <div className={styles.resGroup}>
      <div className={styles.resGroupTitle}>
        {GIAN_FILE_CATEGORY_LABEL[category]}
      </div>
      {loading ? (
        <p className={styles.empty}>読み込み中...</p>
      ) : files.length === 0 ? (
        <p className={styles.empty}>（なし）</p>
      ) : (
        <ul className={styles.resList}>
          {files.map((f) => (
            <li
              key={f.id}
              data-note-item={`file-${f.id}`}
              data-note-label={`資料：${f.name}`}
            >
              <button
                type="button"
                className={styles.fileLink}
                data-file-id={f.id}
                data-file-name={f.name}
                onClick={() => openFileByIdAsync(f.id, f.name)}
              >
                📄 {f.name}
                <span className={styles.fileLinkMark}> ↓</span>
              </button>
              <span className={styles.resSize}>{fmtSize(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 配信データの凍結時点の資料一覧（確定時点のファイルを開ける・distFilesDb） */
function FrozenResourceList({
  category,
  files,
}: {
  category: GianFileCategory;
  files: GianFileMeta[];
}) {
  return (
    <div className={styles.resGroup}>
      <div className={styles.resGroupTitle}>
        {GIAN_FILE_CATEGORY_LABEL[category]}
      </div>
      {files.length === 0 ? (
        <p className={styles.empty}>（なし）</p>
      ) : (
        <ul className={styles.resList}>
          {files.map((f) => (
            <li
              key={f.id}
              data-note-item={`file-${f.id}`}
              data-note-label={`資料：${f.name}`}
            >
              <button
                type="button"
                className={styles.fileLink}
                data-file-id={f.id}
                data-file-name={f.name}
                onClick={() => openFileByIdAsync(f.id, f.name)}
              >
                📄 {f.name}
                <span className={styles.fileLinkMark}> ↓</span>
              </button>
              <span className={styles.resSize}>{fmtSize(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
