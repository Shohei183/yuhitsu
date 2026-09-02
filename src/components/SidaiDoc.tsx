"use client";

import { Gian } from "@/lib/mockData";
import { Sidai } from "@/lib/sidaiStore";
import { toHalfWidth } from "@/lib/format";
import styles from "./SidaiView.module.css";

const LOM_NAME = "一般社団法人小牧青年会議所";

/**
 * 次第を1枚のドキュメントとして描画する共通コンポーネント。
 * 閲覧画面（SidaiView）と配信データ画面（DistributionView）で共用する。
 */
export default function SidaiDoc({
  sidai,
  gianById,
  linkGianTo,
  fixedFileById,
  onOpenFixedFile,
}: {
  sidai: Sidai;
  /** filelink 行の gianId → 議案（見つからなければ null） */
  gianById: (gianId: string) => Gian | null;
  /** filelink チップのリンク先を返す。無ければチップはただのテキスト */
  linkGianTo?: (gianId: string) => string;
  /** filelink 行の固定ファイル id → メタ（見つからなければ null） */
  fixedFileById?: (fileId: string) => { name: string } | null;
  /** 固定ファイルチップのクリック時（開く）。無ければただのテキスト */
  onOpenFixedFile?: (fileId: string, name: string) => void;
}) {
  return (
    <>
      <header className={styles.head}>
        <div className={styles.lom}>{LOM_NAME}</div>
        <div className={styles.title}>{sidai.meetingName}　次第</div>
        <div className={styles.meta}>
          {sidai.datetime && (
            <span>日時：{toHalfWidth(sidai.datetime)}</span>
          )}
          {sidai.place && <span>場所：{sidai.place}</span>}
          {sidai.chair && <span>司会：{sidai.chair}</span>}
        </div>
      </header>

      <div className={styles.rows}>
        {sidai.rows.map((row) => {
          if (row.type === "heading") {
            return (
              <div key={row.id} className={styles.section}>
                {row.title || "（区分名なし）"}
              </div>
            );
          }

          if (row.type === "minutes") {
            const signers = row.signers ?? [];
            return (
              <div key={row.id} className={styles.item}>
                <span className={styles.time}>{toHalfWidth(row.time)}</span>
                <span className={styles.body}>
                  <span className={styles.itemTitle}>
                    {row.title || "議事録作成者及び署名者の指名"}
                  </span>
                  <div className={styles.minutesLine}>
                    <span className={styles.minutesLineLabel}>議事録作成者</span>
                    <span className={styles.nameSlot}>
                      【　{row.recorder || "　　　　"}　】君
                    </span>
                  </div>
                  <div className={styles.minutesLine}>
                    <span className={styles.minutesLineLabel}>署名者</span>
                    {signers.length === 0 ? (
                      <span className={styles.nameSlot}>【　　　　　　】君</span>
                    ) : (
                      signers.map((s, i) => (
                        <span key={i} className={styles.nameSlot}>
                          【　{s || "　　　　"}　】君
                        </span>
                      ))
                    )}
                  </div>
                </span>
                <span className={styles.assignee}>{row.assignee}</span>
              </div>
            );
          }

          if (row.type === "deadlines") {
            const dls = row.deadlineRows ?? [];
            return (
              <div key={row.id} className={styles.item}>
                <span className={styles.time}>{toHalfWidth(row.time)}</span>
                <span className={styles.body}>
                  <span className={styles.itemTitle}>
                    {row.title || "次回資料提出期限の確認"}
                  </span>
                  {dls.map((d) => (
                    <div key={d.id} className={styles.deadlineGroup}>
                      <div className={styles.minutesLine}>
                        <span className={styles.deadlineMeeting}>
                          {d.meeting || "（会議名）"}
                        </span>
                        <span>開催日　{d.meetingDate || "—"}</span>
                      </div>
                      <div className={styles.minutesLine}>
                        <span className={styles.minutesLineLabel} />
                        <span>上程届け　{d.noticeDate || "—"}</span>
                        <span>資料提出日　{d.docDate || "—"}</span>
                      </div>
                    </div>
                  ))}
                </span>
                <span className={styles.assignee}>{row.assignee}</span>
              </div>
            );
          }

          if (row.type === "attendance") {
            return (
              <div key={row.id} className={styles.item}>
                <span className={styles.time}>{toHalfWidth(row.time)}</span>
                <span className={styles.body}>
                  <span className={styles.itemTitle}>
                    {row.title || "出席者及び定足数の確認"}
                  </span>
                  <div className={styles.minutesLine}>
                    <span className={styles.minutesLineLabel}>出席義務数</span>
                    <span className={styles.nameSlot}>
                      【　{row.requiredCount || "　　"}　】名中【
                      {row.presentCount || "　　"}　】名
                    </span>
                  </div>
                  <div className={styles.minutesLine}>
                    <span className={styles.minutesLineLabel}>定足数</span>
                    <span className={styles.nameSlot}>
                      【　{row.quorum || "　　"}　】名
                    </span>
                  </div>
                  <div className={styles.minutesLine}>
                    <span className={styles.minutesLineLabel}>オブザーバー</span>
                    <span className={styles.nameSlot}>
                      【　{row.observerCount || "　　"}　】名
                    </span>
                  </div>
                </span>
                <span className={styles.assignee}>{row.assignee}</span>
              </div>
            );
          }

          const g = row.linkedGianId ? gianById(row.linkedGianId) : null;
          const ff =
            !g && row.linkedFixedFileId && fixedFileById
              ? fixedFileById(row.linkedFixedFileId)
              : null;

          return (
            <div key={row.id} className={styles.item}>
              <span className={styles.time}>{toHalfWidth(row.time)}</span>
              <span className={styles.body}>
                <span className={styles.itemTitle}>
                  {row.title || (
                    <span className={styles.muted}>（項目名なし）</span>
                  )}
                </span>
                {row.type === "blank" && (
                  <span className={styles.note}>
                    ：{row.note || "＿＿＿＿＿＿"}
                  </span>
                )}
                {row.type === "filelink" &&
                  (g ? (
                    (() => {
                      const kindText =
                        g.kind === "基本方針" ? "基本方針" : `${g.kind}議案`;
                      return linkGianTo && row.linkedGianId ? (
                        <a
                          href={linkGianTo(row.linkedGianId)}
                          className={styles.gianChip}
                          data-doc-anchor={`gian-${row.linkedGianId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {kindText}：{g.topic} ↗
                        </a>
                      ) : (
                        <span className={styles.gianChip}>
                          {kindText}：{g.topic}
                        </span>
                      );
                    })()
                  ) : ff ? (
                    onOpenFixedFile && row.linkedFixedFileId ? (
                      <button
                        type="button"
                        className={styles.gianChip}
                        data-file-id={row.linkedFixedFileId}
                        data-file-name={ff.name}
                        onClick={() =>
                          onOpenFixedFile(row.linkedFixedFileId as string, ff.name)
                        }
                      >
                        固定ファイル：{ff.name} ↗
                      </button>
                    ) : (
                      <span className={styles.gianChip}>
                        固定ファイル：{ff.name}
                      </span>
                    )
                  ) : row.linkedFixedFileId ? (
                    <span className={styles.gianChip}>固定ファイル（参照）</span>
                  ) : (
                    <span className={styles.noGian}>（未紐づけ）</span>
                  ))}
              </span>
              <span className={styles.assignee}>{row.assignee}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
