"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { ASSIGNEES, MEMBERS, STATUS_LABEL } from "@/lib/mockData";
import { LOM_NAME } from "@/lib/lom";
import {
  DeadlineEntry,
  Sidai,
  SidaiRow,
  SidaiRowType,
  duplicateSidai,
  getSidai,
  saveSidai,
} from "@/lib/sidaiStore";
import {
  BOARDS,
  Board,
  finalizeDistribution,
} from "@/lib/distributionStore";
import { GianFileMeta, listAllGianFiles } from "@/lib/gianFilesDb";
import { openFileByIdAsync } from "@/lib/backend/files";
import { toHalfWidth } from "@/lib/format";
import { useFixedFiles } from "@/lib/useFixedFiles";
import { useSidai } from "@/lib/useSidaiStore";
import { useGianStore } from "@/lib/useGianStore";
import { useDistributionStore } from "@/lib/useDistributionStore";
import { useCan } from "@/lib/useOrg";
import { useRouter } from "next/navigation";
import styles from "./SidaiBuilder.module.css";

const DND_TYPE = "application/x-gian-id";

const ROW_TYPE_LABEL: Record<SidaiRowType, string> = {
  heading: "区分",
  progress: "定型進行",
  blank: "空欄記入",
  filelink: "ファイルリンク",
  minutes: "議事録指名",
  attendance: "出席・定足数",
  deadlines: "資料提出期限",
};

function blankRow(type: SidaiRowType): SidaiRow {
  const base: SidaiRow = {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    time: "",
    title: "",
    assignee: "",
    linkedGianId: null,
    linkedFixedFileId: null,
    note: "",
  };
  if (type === "minutes") {
    return {
      ...base,
      title: "議事録作成者及び署名者の指名",
      recorder: "",
      signers: ["", "", ""],
    };
  }
  if (type === "attendance") {
    return {
      ...base,
      title: "出席者及び定足数の確認",
      requiredCount: "",
      presentCount: "",
      quorum: "",
      observerCount: "",
    };
  }
  if (type === "deadlines") {
    return {
      ...base,
      title: "次回資料提出期限の確認",
      deadlineRows: [
        {
          id: `dl-${Date.now()}`,
          meeting: "",
          meetingDate: "",
          noticeDate: "",
          docDate: "",
        },
      ],
    };
  }
  return base;
}

export default function SidaiBuilder({ sidaiId }: { sidaiId: string }) {
  const sidai = useSidai(sidaiId);
  const gianStore = useGianStore();
  const distStore = useDistributionStore();
  const can = useCan();
  const router = useRouter();

  const [toast, setToast] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [dragGianId, setDragGianId] = useState<string | null>(null);
  const [palTab, setPalTab] = useState<"gian" | "fixed">("gian");
  const [showFinalize, setShowFinalize] = useState(false);
  const [fName, setFName] = useState("");
  const [fBoard, setFBoard] = useState<Board>("理事会");
  const [fOcc, setFOcc] = useState("");

  const { files: fixedFiles } = useFixedFiles(sidai?.yearId ?? "");

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  // 次第の作成・編集の権限がないユーザーは閲覧画面へ（編集させない）
  useEffect(() => {
    if (!can.createSidai) router.replace(`/sidai/${sidaiId}/view`);
  }, [can.createSidai, router, sidaiId]);

  // 上程済み（未配信）のみ。配信確定済み（locked）は次回以降の次第では出さない。
  // ただし、この次第に既に紐づいている議案は locked でも表示に残す。
  const linkedHere = new Set(
    (sidai?.rows ?? [])
      .map((r) => r.linkedGianId)
      .filter((v): v is string => !!v)
  );
  const submittedGians = Object.values(gianStore)
    .filter(
      (e) =>
        e.gian.status === "submitted" ||
        (e.gian.status === "locked" && linkedHere.has(e.gian.id))
    )
    .map((e) => e.gian);

  const update = useCallback(
    (fn: (s: Sidai) => Sidai) => {
      const cur = getSidai(sidaiId);
      if (!cur) return;
      saveSidai(sidaiId, fn(cur));
    },
    [sidaiId]
  );

  if (!can.createSidai) {
    return (
      <main className={styles.notFound}>
        <p>次第を編集する権限がありません（マスターが /roles で設定）。</p>
        <Link href={`/sidai/${sidaiId}/view`}>← 次第を閲覧</Link>
      </main>
    );
  }

  if (!sidai) {
    return (
      <main className={styles.notFound}>
        <p>次第が見つかりません。</p>
        <Link href="/sidai">← 次第一覧へ</Link>
      </main>
    );
  }

  const setMeta = <K extends keyof Sidai>(key: K, value: Sidai[K]) =>
    update((s) => ({ ...s, [key]: value }));

  const updateRow = (rowId: string, patch: Partial<SidaiRow>) =>
    update((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));

  const addRow = (type: SidaiRowType) =>
    update((s) => ({ ...s, rows: [...s.rows, blankRow(type)] }));

  /** 指定した区分見出しのセクション末尾（次の見出しの直前）に行を追加する */
  const addRowInSection = (headingId: string, type: SidaiRowType) =>
    update((s) => {
      const hIdx = s.rows.findIndex((r) => r.id === headingId);
      if (hIdx < 0) return s;
      let insertAt = s.rows.length;
      for (let i = hIdx + 1; i < s.rows.length; i++) {
        if (s.rows[i].type === "heading") {
          insertAt = i;
          break;
        }
      }
      const rows = [...s.rows];
      rows.splice(insertAt, 0, blankRow(type));
      return { ...s, rows };
    });

  const removeRow = (rowId: string) => {
    update((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== rowId) }));
    if (selectedRowId === rowId) setSelectedRowId(null);
  };

  const moveRow = (rowId: string, dir: "up" | "down") =>
    update((s) => {
      const i = s.rows.findIndex((r) => r.id === rowId);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= s.rows.length) return s;
      const rows = [...s.rows];
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...s, rows };
    });

  const linkGian = (rowId: string, gianId: string) => {
    updateRow(rowId, { linkedGianId: gianId, linkedFixedFileId: null });
    flash("議案を紐づけました");
  };

  const linkFixedFile = (rowId: string, fileId: string) => {
    updateRow(rowId, { linkedFixedFileId: fileId, linkedGianId: null });
    flash("固定ファイルを紐づけました");
  };

  const selectedFilelinkRow = () => {
    const row = sidai.rows.find((r) => r.id === selectedRowId);
    if (!row || row.type !== "filelink") {
      flash("先に次第の「ファイルリンク行」を選択してください");
      return null;
    }
    return row;
  };

  const attachToSelected = (gianId: string) => {
    const row = selectedFilelinkRow();
    if (row) linkGian(row.id, gianId);
  };

  const attachFixedToSelected = (fileId: string) => {
    const row = selectedFilelinkRow();
    if (row) linkFixedFile(row.id, fileId);
  };

  const myDistributions = Object.values(distStore)
    .filter((p) => p.sourceSidaiId === sidaiId)
    .sort((a, b) => b.version - a.version);
  const latestDist = myDistributions[0];

  const onDuplicate = () => {
    const newId = duplicateSidai(sidaiId);
    if (newId) {
      flash("前回の次第を複製しました");
      router.push(`/sidai/${newId}`);
    }
  };

  const openFinalize = () => {
    if (latestDist) {
      // 再確定：前回と同じ会議体・回・名称で（版数が +1 される）
      setFName(latestDist.name);
      setFOcc(latestDist.occurrence);
      setFBoard(latestDist.board);
    } else {
      setFName(`${sidai.meetingName}_配信データ`);
      setFOcc(sidai.meetingName);
      setFBoard(sidai.meetingName.includes("三役") ? "三役会" : "理事会");
    }
    setShowFinalize(true);
  };

  const onFinalize = async () => {
    // 紐づく上程済み議案の資料メタ（確定時点のスナップショット）を集める
    const cur = getSidai(sidaiId);
    const linkedGianIds = Array.from(
      new Set(
        (cur?.rows ?? [])
          .map((r) => r.linkedGianId)
          .filter((v): v is string => !!v)
      )
    );
    const gianFiles: Record<
      string,
      { review: GianFileMeta[]; reference: GianFileMeta[] }
    > = {};
    for (const gid of linkedGianIds) {
      gianFiles[gid] = await listAllGianFiles(gid);
    }
    const pkg = await finalizeDistribution({
      sidaiId,
      name: fName,
      board: fBoard,
      occurrence: fOcc,
      gianFiles,
    });
    setShowFinalize(false);
    if (pkg) {
      flash("配信確定しました（配信フォルダへコピー／収録議案をロック）");
      router.push(`/haishin/${pkg.id}`);
    } else {
      flash("配信確定できませんでした");
    }
  };

  return (
    <div className={styles.root}>
      {/* トップバー */}
      <header className={styles.topbar}>
        <div className={styles.tbLeft}>
          <Link href="/sidai" className={styles.back}>
            ← 次第一覧
          </Link>
          <Link href={`/sidai/${sidaiId}/view`} className={styles.back}>
            閲覧
          </Link>
          <span className={styles.crumb}>次第作成</span>
          <span className={styles.tbTopic}>{sidai.meetingName}</span>
        </div>
        <div className={styles.tbRight}>
          {latestDist && (
            <Link
              href={`/haishin/${latestDist.id}`}
              className={styles.distChip}
            >
              配信確定済み v{latestDist.version} ↗
            </Link>
          )}
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onDuplicate}
            disabled={!can.createSidai}
            title={
              can.createSidai
                ? undefined
                : "次第の作成・複製の権限がありません（マスターが /roles で設定）"
            }
          >
            この次第を複製して新規作成
          </button>
          {can.finalizeDistribution ? (
            <button
              type="button"
              className={styles.finalizeBtn}
              onClick={openFinalize}
            >
              {latestDist ? "再配信確定" : "配信確定"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.finalizeBtn}
              disabled
              title="配信確定は配信データ作成者（専務理事・事務局長クラス）のみ操作できます（上部バーのデモ表示で切替可）"
            >
              {latestDist ? "再配信確定" : "配信確定"}
            </button>
          )}
        </div>
      </header>

      <div className={styles.columns}>
        {/* 左：次第の情報 */}
        <aside className={`${styles.col} ${styles.colLeft}`}>
          <div className={styles.paneTitle}>次第の情報</div>
          <label className={styles.label}>会議名</label>
          <input
            value={sidai.meetingName}
            onChange={(e) => setMeta("meetingName", e.target.value)}
            className={styles.mb}
          />
          <label className={styles.label}>日時</label>
          <input
            value={sidai.datetime}
            placeholder="2026年8月4日（火）19:00〜"
            onChange={(e) => setMeta("datetime", toHalfWidth(e.target.value))}
            className={styles.mb}
          />
          <label className={styles.label}>場所</label>
          <input
            value={sidai.place}
            onChange={(e) => setMeta("place", e.target.value)}
            className={styles.mb}
          />
          <label className={styles.label}>司会</label>
          <select
            value={sidai.chair}
            onChange={(e) => setMeta("chair", e.target.value)}
            className={styles.mb}
          >
            <option value="">（未選択）</option>
            {ASSIGNEES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className={styles.leftNote}>
            行の並び順は上程順ではなく、実施日・進行順に自由に並べ替えられます。
          </div>
        </aside>

        {/* 中央：次第作成エリア */}
        <main className={`${styles.col} ${styles.colCenter}`}>
          {latestDist && (
            <div className={styles.distNote}>
              配信確定済み（{latestDist.name}_v{latestDist.version}）。
              出席者数など当日記入分は引き続き編集できます。差し替えが必要なら
              「再配信確定」で新しい版を作成します。{" "}
              <Link href={`/haishin/${latestDist.id}`}>配信データを見る →</Link>
            </div>
          )}
          <div className={styles.sidaiHeadCard}>
            <div className={styles.sidaiLom}>{LOM_NAME}</div>
            <div className={styles.sidaiMeeting}>{sidai.meetingName} 次第</div>
            <div className={styles.sidaiMeta}>
              {sidai.datetime && (
                <span>日時：{toHalfWidth(sidai.datetime)}</span>
              )}
              {sidai.place && <span>場所：{sidai.place}</span>}
              {sidai.chair && <span>司会：{sidai.chair}</span>}
            </div>
          </div>

          <div className={styles.rows}>
            {(() => {
              const out: ReactNode[] = [];
              let currentHeadingId: string | null = null;
              sidai.rows.forEach((row, idx) => {
                if (row.type === "heading") currentHeadingId = row.id;
                out.push(
                  <SidaiRowView
                    key={row.id}
                    row={row}
                    index={idx}
                    total={sidai.rows.length}
                    selected={selectedRowId === row.id}
                    linkedGian={
                      row.linkedGianId
                        ? gianStore[row.linkedGianId]?.gian ?? null
                        : null
                    }
                    linkedFixedFile={
                      row.linkedFixedFileId
                        ? fixedFiles.find(
                            (f) => f.id === row.linkedFixedFileId
                          ) ?? null
                        : null
                    }
                    dragActive={dragGianId != null}
                    onSelect={() =>
                      setSelectedRowId(
                        selectedRowId === row.id ? null : row.id
                      )
                    }
                    onChange={(patch) => updateRow(row.id, patch)}
                    onMove={(dir) => moveRow(row.id, dir)}
                    onRemove={() => removeRow(row.id)}
                    onDropGian={(gianId) => linkGian(row.id, gianId)}
                  />
                );
                const next = sidai.rows[idx + 1];
                const sectionEnds = !next || next.type === "heading";
                if (sectionEnds && currentHeadingId) {
                  const headingId = currentHeadingId;
                  const headingTitle =
                    sidai.rows.find((r) => r.id === headingId)?.title || "この区分";
                  out.push(
                    <SectionAdd
                      key={`add-${headingId}`}
                      label={headingTitle}
                      onAdd={(t) => addRowInSection(headingId, t)}
                    />
                  );
                }
              });
              return out;
            })()}
          </div>

          <div className={styles.addRow}>
            <span className={styles.addRowLabel}>新しい区分を追加：</span>
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => addRow("heading")}
            >
              ＋ 区分見出し
            </button>
            {sidai.rows.every((r) => r.type !== "heading") && (
              <>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => addRow("progress")}
                >
                  ＋ 定型進行項目
                </button>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => addRow("blank")}
                >
                  ＋ 空欄記入項目
                </button>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => addRow("filelink")}
                >
                  ＋ ファイルリンク項目
                </button>
              </>
            )}
          </div>
        </main>

        {/* 右：ファイルパレット */}
        <aside className={`${styles.col} ${styles.colRight}`}>
          <div className={styles.paneTitle}>ファイルパレット</div>
          <div className={styles.palTabs}>
            <button
              type="button"
              className={`${styles.palTab} ${
                palTab === "gian" ? styles.palTabActive : ""
              }`}
              onClick={() => setPalTab("gian")}
            >
              上程済み議案一覧
            </button>
            <button
              type="button"
              className={`${styles.palTab} ${
                palTab === "fixed" ? styles.palTabActive : ""
              }`}
              onClick={() => setPalTab("fixed")}
            >
              固定ファイル一覧
            </button>
          </div>
          <p className={styles.autoNote}>
            {palTab === "gian"
              ? "議案構築画面で「会議へ上程」した議案が並びます。"
              : "年度フォルダの固定ファイル（規約・議事法等）が並びます。"}
            {selectedRowId
              ? "選択中のファイルリンク行にクリックで紐づけできます。"
              : palTab === "gian"
                ? "ファイルリンク行へドラッグ&ドロップ、または行を選択してクリックで紐づけます。"
                : "ファイルリンク行を選択してクリックで紐づけます。"}
          </p>

          {palTab === "gian" ? (
            submittedGians.length === 0 ? (
              <div className={styles.palEmpty}>
                上程済み（未配信）の議案がありません。
                <br />
                各委員会の議案構築で「会議へ上程」した議案がここに並びます。
              </div>
            ) : (
              <div className={styles.palList}>
                {submittedGians.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={styles.palItem}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_TYPE, g.id);
                      e.dataTransfer.effectAllowed = "copy";
                      setDragGianId(g.id);
                    }}
                    onDragEnd={() => setDragGianId(null)}
                    onClick={() => attachToSelected(g.id)}
                    title="ドラッグして次第の行へ、またはクリックで選択中の行に紐づけ"
                  >
                    <span className={styles.palKind}>
                      {g.kind === "基本方針" ? "基本方針" : `${g.kind}議案`}
                    </span>
                    <span className={styles.palTopic}>{g.topic}</span>
                    <span className={styles.palMeta}>
                      {g.committee} ・ {STATUS_LABEL[g.status]}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : fixedFiles.length === 0 ? (
            <div className={styles.palEmpty}>
              この年度フォルダの固定ファイルがありません。
              <br />
              トップの「固定ファイル」から追加できます。
            </div>
          ) : (
            <div className={styles.palList}>
              {fixedFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.palItem}
                  onClick={() => attachFixedToSelected(f.id)}
                  title="選択中のファイルリンク行に紐づけ"
                >
                  <span className={styles.palKind}>固定ファイル</span>
                  <span className={styles.palTopic}>{f.name}</span>
                  <span className={styles.palMeta}>
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showFinalize && can.finalizeDistribution && (
        <div className={styles.overlay}>
          <div className={styles.finalizeCard}>
            <div className={styles.finalizeTitle}>
              {latestDist ? "再配信確定" : "配信確定"}
            </div>
            <p className={styles.finalizeNote}>
              次第と、紐づく上程済み議案・資料一式を配信フォルダへコピーして独立保存します。
              <br />
              収録した議案は<strong>完全ロック</strong>されます。次第は
              出席者数など当日記入のため<strong>ロックしません</strong>。
            </p>

            <label className={styles.label}>配信データ名称</label>
            <input
              className={styles.mb}
              value={fName}
              onChange={(e) => setFName(e.target.value)}
            />

            <label className={styles.label}>会議体</label>
            <select
              className={styles.mb}
              value={fBoard}
              onChange={(e) => setFBoard(e.target.value as Board)}
            >
              {BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <label className={styles.label}>回の名称（配信フォルダ）</label>
            <input
              className={styles.mb}
              value={fOcc}
              onChange={(e) => setFOcc(e.target.value)}
            />

            <div className={styles.finalizeHint}>
              コピー先：配信／{fBoard}／{fOcc || "（回の名称）"}　｜　版数は自動
            </div>

            <div className={styles.finalizeActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setShowFinalize(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.finalizeBtn}
                onClick={onFinalize}
              >
                確定する
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

/* ─────────────── 配信フォルダツリー ─────────────── */

/* ─────────────── 区分ごとの「項目を追加」 ─────────────── */

function SectionAdd({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (type: SidaiRowType) => void;
}) {
  return (
    <div className={styles.sectionAdd}>
      <span className={styles.sectionAddLabel}>「{label}」に項目を追加：</span>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("progress")}
      >
        ＋ 定型進行
      </button>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("blank")}
      >
        ＋ 空欄記入
      </button>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("filelink")}
      >
        ＋ ファイルリンク
      </button>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("minutes")}
      >
        ＋ 議事録指名
      </button>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("attendance")}
      >
        ＋ 出席・定足数
      </button>
      <button
        type="button"
        className={styles.sectionAddBtn}
        onClick={() => onAdd("deadlines")}
      >
        ＋ 資料提出期限
      </button>
    </div>
  );
}

/* ─────────────── 議事録作成者・署名者の指名（編集）─────────────── */

function MemberSelect({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className={styles.minutesSelect}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {MEMBERS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

function MinutesEditor({
  row,
  onChange,
}: {
  row: SidaiRow;
  onChange: (patch: Partial<SidaiRow>) => void;
}) {
  const signers = row.signers ?? [];
  const setSigner = (i: number, v: string) =>
    onChange({ signers: signers.map((s, idx) => (idx === i ? v : s)) });
  const addSigner = () => onChange({ signers: [...signers, ""] });
  const removeSigner = (i: number) =>
    onChange({ signers: signers.filter((_, idx) => idx !== i) });

  return (
    <div className={styles.minutesBox}>
      <div className={styles.minutesRow}>
        <span className={styles.minutesLabel}>議事録作成者</span>
        <MemberSelect
          value={row.recorder ?? ""}
          placeholder="（未選択）"
          onChange={(v) => onChange({ recorder: v })}
        />
        <span className={styles.minutesKun}>君</span>
      </div>
      <div className={styles.minutesRow}>
        <span className={styles.minutesLabel}>署名者</span>
        {signers.map((s, i) => (
          <span key={i} className={styles.signerSlot}>
            <MemberSelect
              value={s}
              placeholder="（未選択）"
              onChange={(v) => setSigner(i, v)}
            />
            <span className={styles.minutesKun}>君</span>
            {signers.length > 1 && (
              <button
                type="button"
                className={styles.signerRemove}
                title="この署名者を削除"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSigner(i);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          className={styles.signerAdd}
          onClick={(e) => {
            e.stopPropagation();
            addSigner();
          }}
        >
          ＋ 署名者
        </button>
      </div>
    </div>
  );
}

/* ─────────────── 出席者及び定足数の確認（編集）─────────────── */

function AttendanceEditor({
  row,
  onChange,
}: {
  row: SidaiRow;
  onChange: (patch: Partial<SidaiRow>) => void;
}) {
  const num = (
    value: string | undefined,
    onValue: (v: string) => void,
    placeholder = ""
  ) => (
    <input
      className={styles.countInput}
      value={value ?? ""}
      placeholder={placeholder}
      inputMode="numeric"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onValue(e.target.value)}
    />
  );

  return (
    <div className={styles.minutesBox}>
      <div className={styles.minutesRow}>
        <span className={styles.minutesLabel}>出席義務数</span>
        {num(row.requiredCount, (v) => onChange({ requiredCount: v }), "13")}
        <span className={styles.minutesKun}>名中</span>
        {num(row.presentCount, (v) => onChange({ presentCount: v }))}
        <span className={styles.minutesKun}>名（当日記入）</span>
      </div>
      <div className={styles.minutesRow}>
        <span className={styles.minutesLabel}>定足数</span>
        {num(row.quorum, (v) => onChange({ quorum: v }), "11")}
        <span className={styles.minutesKun}>名</span>
      </div>
      <div className={styles.minutesRow}>
        <span className={styles.minutesLabel}>オブザーバー</span>
        {num(row.observerCount, (v) => onChange({ observerCount: v }))}
        <span className={styles.minutesKun}>名（当日記入）</span>
      </div>
    </div>
  );
}

/* ─────────────── 次回資料提出期限の確認（編集）─────────────── */

function DeadlinesEditor({
  row,
  onChange,
}: {
  row: SidaiRow;
  onChange: (patch: Partial<SidaiRow>) => void;
}) {
  const rows = row.deadlineRows ?? [];
  const patch = (i: number, p: Partial<DeadlineEntry>) =>
    onChange({
      deadlineRows: rows.map((d, idx) => (idx === i ? { ...d, ...p } : d)),
    });
  const addRow = () =>
    onChange({
      deadlineRows: [
        ...rows,
        {
          id: `dl-${Date.now()}`,
          meeting: "",
          meetingDate: "",
          noticeDate: "",
          docDate: "",
        },
      ],
    });
  const removeRow = (i: number) =>
    onChange({ deadlineRows: rows.filter((_, idx) => idx !== i) });

  return (
    <div className={styles.minutesBox}>
      {rows.map((d, i) => (
        <div key={d.id} className={styles.deadlineEntry}>
          <div className={styles.minutesRow}>
            <input
              className={styles.deadlineMeetingInput}
              value={d.meeting}
              placeholder="会議名（例：2026年4月定例三役会）"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patch(i, { meeting: e.target.value })}
            />
            <span className={styles.minutesKun}>開催日</span>
            <input
              className={styles.deadlineDateInput}
              value={d.meetingDate}
              placeholder="3月17日"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patch(i, { meetingDate: e.target.value })}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className={styles.signerRemove}
                title="この会議を削除"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRow(i);
                }}
              >
                ×
              </button>
            )}
          </div>
          <div className={styles.minutesRow}>
            <span className={styles.minutesLabel}>上程届け</span>
            <input
              className={styles.deadlineDateInput}
              value={d.noticeDate}
              placeholder="3月12日"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patch(i, { noticeDate: e.target.value })}
            />
            <span className={styles.minutesKun}>資料提出日</span>
            <input
              className={styles.deadlineDateInput}
              value={d.docDate}
              placeholder="3月13日"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patch(i, { docDate: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={styles.signerAdd}
        onClick={(e) => {
          e.stopPropagation();
          addRow();
        }}
      >
        ＋ 会議を追加
      </button>
    </div>
  );
}

/* ───────────────────────── 行 ───────────────────────── */

function SidaiRowView({
  row,
  index,
  total,
  selected,
  linkedGian,
  linkedFixedFile,
  dragActive,
  onSelect,
  onChange,
  onMove,
  onRemove,
  onDropGian,
}: {
  row: SidaiRow;
  index: number;
  total: number;
  selected: boolean;
  linkedGian: { committee: string; topic: string; kind: string } | null;
  linkedFixedFile: { id: string; name: string } | null;
  dragActive: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SidaiRow>) => void;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
  onDropGian: (gianId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isLink = row.type === "filelink";

  const controls = (
    <span className={styles.rowControls}>
      <button
        type="button"
        className={styles.iconBtn}
        title="上へ"
        disabled={index === 0}
        onClick={() => onMove("up")}
      >
        ▲
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        title="下へ"
        disabled={index === total - 1}
        onClick={() => onMove("down")}
      >
        ▼
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        title="この行を削除"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );

  if (row.type === "heading") {
    return (
      <div className={`${styles.row} ${styles.rowHeading}`}>
        <input
          className={styles.headingInput}
          value={row.title}
          placeholder="区分名（例：協議事項）"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        {controls}
      </div>
    );
  }

  return (
    <div
      className={`${styles.row} ${isLink ? styles.row_filelink : ""} ${
        selected ? styles.rowSelected : ""
      } ${isLink && dragOver ? styles.rowDragOver : ""}`}
      onClick={isLink ? onSelect : undefined}
      onDragOver={
        isLink
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={isLink ? () => setDragOver(false) : undefined}
      onDrop={
        isLink
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const id = e.dataTransfer.getData(DND_TYPE);
              if (id) onDropGian(id);
            }
          : undefined
      }
    >
      <div className={styles.rowMain}>
        <span className={styles.rowTypeTag}>{ROW_TYPE_LABEL[row.type]}</span>
        <input
          className={styles.timeInput}
          value={row.time}
          placeholder="時刻"
          inputMode="numeric"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ time: toHalfWidth(e.target.value) })}
        />
        <input
          className={styles.titleInput}
          value={row.title}
          placeholder={
            row.type === "blank" ? "項目名（例：出席者数）" : "項目名"
          }
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        {row.type !== "blank" && (
          <select
            className={styles.assigneeSelect}
            value={row.assignee}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ assignee: e.target.value })}
          >
            <option value="">担当者（未選択）</option>
            {ASSIGNEES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        {controls}
      </div>

      {row.type === "blank" && (
        <input
          className={styles.noteInput}
          value={row.note}
          placeholder="その場で記入する内容（例：29名）"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      )}

      {row.type === "minutes" && (
        <MinutesEditor row={row} onChange={onChange} />
      )}

      {row.type === "attendance" && (
        <AttendanceEditor row={row} onChange={onChange} />
      )}

      {row.type === "deadlines" && (
        <DeadlinesEditor row={row} onChange={onChange} />
      )}

      {isLink && (
        <div className={styles.linkArea}>
          {linkedGian ? (
            <div className={styles.linkChip}>
              <span className={styles.linkChipKind}>
                {linkedGian.kind === "基本方針"
                  ? "基本方針"
                  : `${linkedGian.kind}議案`}
              </span>
              <span className={styles.linkChipText}>
                {linkedGian.topic}
                <span className={styles.linkChipSub}>{linkedGian.committee}</span>
              </span>
              {row.linkedGianId && (
                <a
                  href={`/gian/${row.linkedGianId}/view`}
                  className={styles.linkOpen}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  議案を開く ↗
                </a>
              )}
              <button
                type="button"
                className={styles.linkUnlink}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ linkedGianId: null });
                }}
              >
                解除
              </button>
            </div>
          ) : linkedFixedFile ? (
            <div className={styles.linkChip}>
              <span className={styles.linkChipKind}>固定ファイル</span>
              <span className={styles.linkChipText}>{linkedFixedFile.name}</span>
              <button
                type="button"
                className={styles.linkOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  openFileByIdAsync(linkedFixedFile.id, linkedFixedFile.name);
                }}
              >
                開く ↗
              </button>
              <button
                type="button"
                className={styles.linkUnlink}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ linkedFixedFileId: null });
                }}
              >
                解除
              </button>
            </div>
          ) : (
            <div
              className={`${styles.linkEmpty} ${
                dragActive ? styles.linkEmptyDrag : ""
              }`}
            >
              未紐づけ
              <span className={styles.linkEmptyHint}>
                {selected
                  ? "右のパレットから議案／固定ファイルをクリック"
                  : "この行を選択 → パレットからクリック、または議案をドラッグ&ドロップ"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
