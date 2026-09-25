"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AssignedMember,
  BudgetLine,
  FeedbackExchange,
  FeedbackRound,
  Gian,
  ItemLink,
  ScheduleEntry,
  ScheduleRow,
  STATUS_LABEL,
  TemplateItem,
} from "@/lib/mockData";
import { GianFileMeta } from "@/lib/gianFilesDb";
import { useGianFiles } from "@/lib/useGianFiles";
import { openFileByIdAsync } from "@/lib/backend/files";
import {
  AUTOSAVE_LIMIT,
  ReplacementRequest,
  ReplacementStatus,
  Snapshot,
  decideReplacement,
  getEntry,
  lockGian,
  requestReplacement,
  isKihon,
  saveDraftSnapshot,
  saveGian,
  showsPriorFeedback,
  submitGian,
} from "@/lib/gianStore";
import { useGianEntry, useGianStore } from "@/lib/useGianStore";
import { useBudgetStore } from "@/lib/useBudgetStore";
import { budgetForGian, createBudget, sectionTotal } from "@/lib/budgetStore";
import { useCanIn, useCommitteeOfGian } from "@/lib/useOrg";
import { formatJaDateTime, jpNum, sumAmounts } from "@/lib/format";
import { isRichEmpty } from "@/lib/richText";
import { useLomName } from "@/lib/useSettingsStore";
import RichText from "./RichText";
import GianResourcePanel from "./GianResourcePanel";

import styles from "./GianBuilder.module.css";

/** 事業概要の中で、日付／内容の表として編集する項目のラベル */
const SCHEDULE_ITEM_LABEL = "実施までのスケジュール";
/** 事業概要の中で、事業収支予算書へのリンクを出す項目のラベル */
const BUDGET_ITEM_LABEL = "予算総額";

type TemplateListKey = "outline" | "overview";

export default function GianBuilder({ initialGian }: { initialGian: Gian }) {
  const gianId = initialGian.id;
  const entry = useGianEntry(gianId);
  const gian = entry?.gian ?? initialGian;
  const snapshots = entry?.snapshots ?? [];
  const requests = entry?.requests ?? [];
  const pendingRequest = requests.find((r) => r.status === "pending") ?? null;
  const committeeInfo = useCommitteeOfGian(gianId);
  // 所属委員会以外の議案は編集できない（委員長・委員）
  const can = useCanIn(
    gian.yearId ?? committeeInfo?.year.id,
    committeeInfo?.committee.id ?? gian.committeeId
  );
  const gianStore = useGianStore();
  const router = useRouter();
  useBudgetStore();
  const linkedBudget = budgetForGian(gianId);
  const openOrCreateBudget = () => {
    if (linkedBudget) {
      router.push(`/budget/${linkedBudget.id}`);
      return;
    }
    const yearId = committeeInfo?.year.id;
    if (!yearId) return;
    const id = createBudget({ yearId, gianId, title: gian.topic });
    router.push(`/budget/${id}`);
  };

  const kihon = isKihon(gian.kind);
  /** 基本方針「事業計画」のリンク先候補（自分以外の協議議案のみ） */
  const linkOptions = kihon
    ? Object.values(gianStore)
        .map((e) => e.gian)
        .filter(
          (g, i, arr) =>
            g.id !== gianId &&
            g.kind === "協議" &&
            arr.findIndex((x) => x.id === g.id) === i
        )
        .map((g) => ({ id: g.id, topic: g.topic, kind: g.kind }))
    : [];

  // ── 項目の添付リンク（他の議案 / この議案の資料）の候補 ──
  const { files: reviewFiles } = useGianFiles(gianId, "review");
  const { files: referenceFiles } = useGianFiles(gianId, "reference");
  const attachFiles: GianFileMeta[] = [...reviewFiles, ...referenceFiles];
  const attachGianGroups: { committee: string; gians: { id: string; label: string }[] }[] =
    (() => {
      const map = new Map<string, { id: string; label: string }[]>();
      for (const e of Object.values(gianStore)) {
        if (e.gian.id === gianId) continue;
        // 同じ年度の議案だけを候補にする
        if (e.gian.yearId !== gian.yearId) continue;
        const c = e.gian.committee || "（委員会未設定）";
        const kl = e.gian.kind === "基本方針" ? "基本方針" : `${e.gian.kind}議案`;
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push({ id: e.gian.id, label: `${kl}：${e.gian.topic}` });
      }
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "ja"))
        .map(([committee, gians]) => ({ committee, gians }));
    })();

  const [toast, setToast] = useState<string | null>(null);

  const readOnly = gian.status !== "editing" || !can.editGian;

  /** 議案本体の更新（localStorage ストアへ保存） */
  const setGian = useCallback(
    (updater: (g: Gian) => Gian) => {
      const current = getEntry(gianId)?.gian ?? initialGian;
      saveGian(gianId, updater(current));
    },
    [gianId, initialGian]
  );

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  function updateField<K extends keyof Gian>(key: K, value: Gian[K]) {
    setGian((g) => ({ ...g, [key]: value }));
  }

  function updateTemplateItem(list: TemplateListKey, no: number, body: string) {
    setGian((g) => ({
      ...g,
      [list]: g[list].map((o) => (o.no === no ? { ...o, body } : o)),
    }));
  }

  /** 基本方針「事業計画」項目：事業名（ラベル）の編集 */
  function updateOverviewLabel(no: number, label: string) {
    setGian((g) => ({
      ...g,
      overview: g.overview.map((o) => (o.no === no ? { ...o, label } : o)),
    }));
  }
  /** 基本方針「事業計画」項目の追加 */
  function addOverviewItem() {
    setGian((g) => {
      const nextNo =
        g.overview.reduce((m, o) => Math.max(m, o.no), 0) + 1;
      return {
        ...g,
        overview: [...g.overview, { no: nextNo, label: "", body: "" }],
      };
    });
  }
  /** 基本方針「事業計画」項目の削除（番号を振り直す） */
  function removeOverviewItem(no: number) {
    setGian((g) => ({
      ...g,
      overview: g.overview
        .filter((o) => o.no !== no)
        .map((o, i) => ({ ...o, no: i + 1 })),
    }));
  }

  /** 項目に添付したリンク（他の議案・資料）の更新 */
  function updateItemAttachments(
    list: TemplateListKey,
    no: number,
    attachments: ItemLink[]
  ) {
    setGian((g) => ({
      ...g,
      [list]: g[list].map((o) =>
        o.no === no ? { ...o, attachments } : o
      ),
    }));
  }

  /** 基本方針「事業計画」項目 → 別議案へのリンク設定 */
  function updateTemplateItemLink(no: number, linkedGianId: string | undefined) {
    setGian((g) => ({
      ...g,
      overview: g.overview.map((o) =>
        o.no === no ? { ...o, linkedGianId } : o
      ),
    }));
  }

  /** 前回までの流れをすべて削除（外部配信前用） */
  function clearAllPriorFeedback() {
    if (
      gian.priorFeedback.length > 0 &&
      !window.confirm(
        "「前回までの流れ（意見と対応）」をすべて削除します。\n（外部配信用に内部の審議経過を消す操作です）\n\nよろしいですか？"
      )
    ) {
      return;
    }
    setGian((g) => ({ ...g, priorFeedback: [] }));
  }

  // ── 議案上程スケジュール（全種別・行の追加/削除可）──
  function updateSubmissionRow(index: number, patch: Partial<ScheduleRow>) {
    setGian((g) => ({
      ...g,
      submissionSchedule: g.submissionSchedule.map((r, i) =>
        i === index ? { ...r, ...patch } : r
      ),
    }));
  }
  function addSubmissionRow() {
    setGian((g) => ({
      ...g,
      submissionSchedule: [
        ...g.submissionSchedule,
        { round: "", meeting: "", date: "", format: "" },
      ],
    }));
  }
  function removeSubmissionRow(index: number) {
    setGian((g) => ({
      ...g,
      submissionSchedule: g.submissionSchedule.filter((_, i) => i !== index),
    }));
  }

  // ── 基本方針：配属メンバー ──
  function updateAssignedMember(id: string, patch: Partial<AssignedMember>) {
    setGian((g) => ({
      ...g,
      assignedMembers: (g.assignedMembers ?? []).map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    }));
  }
  function addAssignedMember() {
    setGian((g) => ({
      ...g,
      assignedMembers: [
        ...(g.assignedMembers ?? []),
        { id: `am-${Date.now()}`, role: "", name: "" },
      ],
    }));
  }
  function removeAssignedMember(id: string) {
    setGian((g) => ({
      ...g,
      assignedMembers: (g.assignedMembers ?? []).filter((m) => m.id !== id),
    }));
  }

  // ── 基本方針：担当 ──
  function updateAssignedLead(id: string, patch: Partial<AssignedMember>) {
    setGian((g) => ({
      ...g,
      assignedLeads: (g.assignedLeads ?? []).map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    }));
  }
  function addAssignedLead() {
    setGian((g) => ({
      ...g,
      assignedLeads: [
        ...(g.assignedLeads ?? []),
        { id: `al-${Date.now()}`, role: "", name: "" },
      ],
    }));
  }
  function removeAssignedLead(id: string) {
    setGian((g) => ({
      ...g,
      assignedLeads: (g.assignedLeads ?? []).filter((m) => m.id !== id),
    }));
  }

  // ── 基本方針：委員会予算 ──
  function updateBudgetLine(
    part: "income" | "expense",
    id: string,
    patch: Partial<BudgetLine>
  ) {
    setGian((g) => {
      const cb = g.committeeBudget ?? { income: [], expense: [] };
      return {
        ...g,
        committeeBudget: {
          ...cb,
          [part]: cb[part].map((l) => (l.id === id ? { ...l, ...patch } : l)),
        },
      };
    });
  }
  function addBudgetLine(part: "income" | "expense") {
    setGian((g) => {
      const cb = g.committeeBudget ?? { income: [], expense: [] };
      return {
        ...g,
        committeeBudget: {
          ...cb,
          [part]: [
            ...cb[part],
            { id: `bl-${Date.now()}`, label: "", amount: "" },
          ],
        },
      };
    });
  }
  function removeBudgetLine(part: "income" | "expense", id: string) {
    setGian((g) => {
      const cb = g.committeeBudget ?? { income: [], expense: [] };
      return {
        ...g,
        committeeBudget: {
          ...cb,
          [part]: cb[part].filter((l) => l.id !== id),
        },
      };
    });
  }

  function updateScheduleEntry(id: string, patch: Partial<ScheduleEntry>) {
    setGian((g) => ({
      ...g,
      implementationSchedule: g.implementationSchedule.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      ),
    }));
  }

  function addScheduleEntry() {
    setGian((g) => ({
      ...g,
      implementationSchedule: [
        ...g.implementationSchedule,
        { id: `sch-${Date.now()}`, date: "", content: "" },
      ],
    }));
  }

  function removeScheduleEntry(id: string) {
    setGian((g) => ({
      ...g,
      implementationSchedule: g.implementationSchedule.filter(
        (e) => e.id !== id
      ),
    }));
  }

  function updateRound(roundId: string, patch: Partial<FeedbackRound>) {
    setGian((g) => ({
      ...g,
      priorFeedback: g.priorFeedback.map((r) =>
        r.id === roundId ? { ...r, ...patch } : r
      ),
    }));
  }

  function addRound() {
    setGian((g) => ({
      ...g,
      priorFeedback: [
        ...g.priorFeedback,
        {
          id: `fr-${Date.now()}`,
          meetingName: "",
          date: "",
          format: "協議",
          exchanges: [{ id: `ex-${Date.now()}`, opinion: "", response: "" }],
        },
      ],
    }));
  }

  function removeRound(roundId: string) {
    setGian((g) => ({
      ...g,
      priorFeedback: g.priorFeedback.filter((r) => r.id !== roundId),
    }));
  }

  function updateExchange(
    roundId: string,
    exId: string,
    patch: Partial<FeedbackExchange>
  ) {
    setGian((g) => ({
      ...g,
      priorFeedback: g.priorFeedback.map((r) =>
        r.id === roundId
          ? {
              ...r,
              exchanges: r.exchanges.map((e) =>
                e.id === exId ? { ...e, ...patch } : e
              ),
            }
          : r
      ),
    }));
  }

  function addExchange(roundId: string) {
    setGian((g) => ({
      ...g,
      priorFeedback: g.priorFeedback.map((r) =>
        r.id === roundId
          ? {
              ...r,
              exchanges: [
                ...r.exchanges,
                { id: `ex-${Date.now()}`, opinion: "", response: "" },
              ],
            }
          : r
      ),
    }));
  }

  function removeExchange(roundId: string, exId: string) {
    setGian((g) => ({
      ...g,
      priorFeedback: g.priorFeedback.map((r) =>
        r.id === roundId
          ? { ...r, exchanges: r.exchanges.filter((e) => e.id !== exId) }
          : r
      ),
    }));
  }

  function saveDraft() {
    saveDraftSnapshot(gianId, "下書き保存");
    flash(`下書きを保存しました（一時記録：直近${AUTOSAVE_LIMIT}件を保持）`);
  }

  function submitToMeeting() {
    if (
      !window.confirm(
        "この議案を会議へ上程します。\n上程後は本文・資料が編集ロックされ、変更には「差し替え申請」と承認が必要になります。\n\n上程しますか？"
      )
    ) {
      return;
    }
    const snap = submitGian(gianId);
    flash(
      snap
        ? "会議へ上程しました（スナップショットを保存）"
        : "上程できませんでした（既に上程済みです）"
    );
  }

  function applyReplacement() {
    const note = window.prompt(
      "差し替えたい内容・理由を入力してください（配信データ作成者が承認します）"
    );
    if (note == null) return;
    requestReplacement(gianId, note || "（理由未記入）");
    flash("差し替え申請を送信しました（承認待ち）");
  }

  function decide(requestId: string, approve: boolean) {
    decideReplacement(gianId, requestId, approve);
    flash(
      approve
        ? "差し替え申請を承認しました（編集中に戻しました）"
        : "差し替え申請を却下しました"
    );
  }

  function confirmDistribution() {
    if (
      !window.confirm(
        "この議案を配信確定にします（モック：本来は次第作成／配信フローで行います）。\n配信確定後は完全ロックされます。よろしいですか？"
      )
    ) {
      return;
    }
    lockGian(gianId);
    flash("配信確定にしました（完全ロック）");
  }

  return (
    <div className={styles.root}>
      {/* ── トップバー（全カラムを横断）── */}
      <header className={styles.topbar}>
        <div className={styles.tbLeft}>
          <Link
            href={
              committeeInfo
                ? `/committee/${committeeInfo.committee.id}/gian`
                : "/"
            }
            className={styles.back}
          >
            ← 議案一覧
          </Link>
          <Link href={`/gian/${gianId}/view`} className={styles.back}>
            閲覧
          </Link>
          <span className={styles.crumb}>{gian.committee} ／ 議案構築</span>
          <span className={styles.tbTopic} title={gian.topic}>
            {gian.topic}
          </span>
        </div>
        <div className={styles.tbRight}>
          <span className={`${styles.badge} ${styles[gian.status]}`}>
            {STATUS_LABEL[gian.status]}
          </span>
          {gian.status === "editing" && can.editGian && (
            <>
              <button type="button" className={styles.ghostBtn} onClick={saveDraft}>
                下書き保存
              </button>
              {can.submitGian ? (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={submitToMeeting}
                >
                  会議へ上程
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled
                  title="「会議へ上程」の権限がありません（マスターが /roles で設定・上部バーのデモ表示で切替可）"
                >
                  会議へ上程
                </button>
              )}
            </>
          )}
          {gian.status === "submitted" &&
            (pendingRequest ? (
              <span className={styles.pendingTag}>差し替え申請中（承認待ち）</span>
            ) : can.requestReplacement ? (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={applyReplacement}
              >
                差し替え申請
              </button>
            ) : (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled
                title="「差し替え申請」の権限がありません（マスターが /roles で設定）"
              >
                差し替え申請
              </button>
            ))}
          {gian.status === "locked" && (
            <span className={styles.lockedTag}>編集ロック（配信確定済み）</span>
          )}
        </div>
      </header>

      {/* ── 3カラム ── */}
      <div className={styles.columns}>
        {/* 左：ページ移動用ナビ */}
        <aside className={`${styles.col} ${styles.colLeft}`}>
          <div className={styles.paneTitle}>ナビゲーション</div>
          <GianNav gianId={gianId} gian={gian} committeeInfo={committeeInfo} />
        </aside>

        {/* 中央：本文 */}
        <main className={`${styles.col} ${styles.colCenter}`}>
          <ProposalHeader
            gian={gian}
            readOnly={readOnly}
            kihon={kihon}
            onField={updateField}
            onUpdateSubmissionRow={updateSubmissionRow}
            onAddSubmissionRow={addSubmissionRow}
            onRemoveSubmissionRow={removeSubmissionRow}
            onUpdateMember={updateAssignedMember}
            onAddMember={addAssignedMember}
            onRemoveMember={removeAssignedMember}
            onUpdateLead={updateAssignedLead}
            onAddLead={addAssignedLead}
            onRemoveLead={removeAssignedLead}
          />

          <TemplateSection
            title={kihon ? "基本方針" : "事業要綱"}
            items={gian.outline}
            readOnly={readOnly}
            onChange={(no, body) => updateTemplateItem("outline", no, body)}
            attach={{
              gianGroups: attachGianGroups,
              files: attachFiles,
              onChange: (no, a) => updateItemAttachments("outline", no, a),
            }}
          />
          {kihon ? (
            <PlanItemsSection
              items={gian.overview}
              readOnly={readOnly}
              linkOptions={linkOptions}
              onChangeLabel={updateOverviewLabel}
              onChangeLink={updateTemplateItemLink}
              onAdd={addOverviewItem}
              onRemove={removeOverviewItem}
            />
          ) : (
            <TemplateSection
              title="事業概要"
              items={gian.overview}
              readOnly={readOnly}
              onChange={(no, body) => updateTemplateItem("overview", no, body)}
              attach={{
                gianGroups: attachGianGroups,
                files: attachFiles,
                onChange: (no, a) => updateItemAttachments("overview", no, a),
              }}
              schedule={gian.implementationSchedule}
              onScheduleChange={updateScheduleEntry}
              onScheduleAdd={addScheduleEntry}
              onScheduleRemove={removeScheduleEntry}
              budgetLink={{
                hasBudget: !!linkedBudget,
                total: linkedBudget
                  ? sectionTotal(linkedBudget.expense)
                  : null,
                onOpen: openOrCreateBudget,
              }}
            />
          )}

          {kihon && (
            <section className={styles.card}>
              <div className={styles.cardHeading}>事業予定</div>
              <ScheduleTable
                entries={gian.implementationSchedule}
                readOnly={readOnly}
                onChange={updateScheduleEntry}
                onAdd={addScheduleEntry}
                onRemove={removeScheduleEntry}
              />
            </section>
          )}

          {kihon && (
            <CommitteeBudgetSection
              budget={
                gian.committeeBudget ?? { income: [], expense: [] }
              }
              readOnly={readOnly}
              onUpdate={updateBudgetLine}
              onAdd={addBudgetLine}
              onRemove={removeBudgetLine}
            />
          )}

          {showsPriorFeedback(gian.kind) && (
            <PriorFeedbackSection
              rounds={gian.priorFeedback}
              readOnly={readOnly}
              onUpdateRound={updateRound}
              onAddRound={addRound}
              onRemoveRound={removeRound}
              onUpdateExchange={updateExchange}
              onAddExchange={addExchange}
              onRemoveExchange={removeExchange}
              onClearAll={clearAllPriorFeedback}
            />
          )}

          <FlowPanel
            gian={gian}
            snapshots={snapshots}
            requests={requests}
            canApprove={can.approveReplacement}
            onDecide={decide}
            onDistribution={confirmDistribution}
          />
        </main>

        {/* 右：資料（アップロード） */}
        <aside className={`${styles.col} ${styles.colRight}`}>
          <div className={styles.paneTitle}>資料</div>
          <p className={styles.autoNote}>
            ファイルをドラッグ＆ドロップ、または「ファイルを選択」で追加します
            （このブラウザ内に保存）。
          </p>
          <GianResourcePanel
            gianId={gianId}
            category="review"
            editable={!readOnly}
          />
          <GianResourcePanel
            gianId={gianId}
            category="reference"
            editable={!readOnly}
          />
        </aside>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

/* ───────────────────────── 左カラム：ページ移動用ナビ ───────────────────────── */

function GianNav({
  gianId,
  gian,
  committeeInfo,
}: {
  gianId: string;
  gian: Gian;
  committeeInfo:
    | { year: { id: string; label: string }; committee: { id: string; name: string; gianIds: string[] } }
    | undefined;
}) {
  const router = useRouter();
  useBudgetStore();
  const cid = committeeInfo?.committee.id;

  const linkedBudget = budgetForGian(gianId);
  const onBudget = () => {
    if (linkedBudget) {
      router.push(`/budget/${linkedBudget.id}`);
      return;
    }
    const yearId = committeeInfo?.year.id;
    if (!yearId) return;
    const id = createBudget({ yearId, gianId, title: gian.topic });
    router.push(`/budget/${id}`);
  };

  return (
    <nav className={styles.nav}>
      <div className={styles.navGroup}>
        <div className={styles.navGroupTitle}>この議案</div>
        <Link href={`/gian/${gianId}/view`} className={styles.navItem}>
          📄 議案を閲覧（読み取り専用）
        </Link>
        <button type="button" className={styles.navItem} onClick={onBudget}>
          💰 {linkedBudget ? "事業収支予算書を開く" : "事業収支予算書を作成"}
        </button>
      </div>

      {committeeInfo && cid && (
        <div className={styles.navGroup}>
          <div className={styles.navGroupTitle}>
            {committeeInfo.committee.name}
          </div>
          <Link href={`/committee/${cid}`} className={styles.navItem}>
            📁 委員会フォルダ
          </Link>
          <Link href={`/committee/${cid}/gian`} className={styles.navItem}>
            📁 議案構築（一覧）
          </Link>
          <Link href={`/committee/${cid}/report`} className={styles.navItem}>
            📁 委員会報告
          </Link>
          <Link href={`/committee/${cid}/shared`} className={styles.navItem}>
            📁 共有用フォルダ
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ───────────────────────── 中央カラム ───────────────────────── */

function PersonTable({
  rows,
  readOnly,
  onUpdate,
  onAdd,
  onRemove,
  addLabel,
  rolePlaceholder,
}: {
  rows: AssignedMember[];
  readOnly: boolean;
  onUpdate: (id: string, patch: Partial<AssignedMember>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  addLabel: string;
  rolePlaceholder?: string;
}) {
  return (
    <>
      <div className={styles.scheduleWrap}>
        <table className={styles.schedule}>
          <thead>
            <tr>
              <th style={{ width: "38%" }}>役職</th>
              <th>氏名</th>
              {!readOnly && <th style={{ width: 40 }} aria-label="操作" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 2 : 3} className={styles.schedEmpty}>
                  （未記入）
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <input
                    className={styles.schedCell}
                    value={m.role}
                    readOnly={readOnly}
                    placeholder={rolePlaceholder ?? "役職"}
                    onChange={(e) => onUpdate(m.id, { role: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.schedCell}
                    value={m.name}
                    readOnly={readOnly}
                    placeholder="氏名"
                    onChange={(e) => onUpdate(m.id, { name: e.target.value })}
                  />
                </td>
                {!readOnly && (
                  <td>
                    <button
                      type="button"
                      className={styles.schedDel}
                      title="この行を削除"
                      onClick={() => onRemove(m.id)}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button type="button" className={styles.dashed} onClick={onAdd}>
          {addLabel}
        </button>
      )}
    </>
  );
}

function ProposalHeader({
  gian,
  readOnly,
  kihon,
  onField,
  onUpdateSubmissionRow,
  onAddSubmissionRow,
  onRemoveSubmissionRow,
  onUpdateMember,
  onAddMember,
  onRemoveMember,
  onUpdateLead,
  onAddLead,
  onRemoveLead,
}: {
  gian: Gian;
  readOnly: boolean;
  kihon: boolean;
  onField: <K extends keyof Gian>(key: K, value: Gian[K]) => void;
  onUpdateSubmissionRow: (index: number, patch: Partial<ScheduleRow>) => void;
  onAddSubmissionRow: () => void;
  onRemoveSubmissionRow: (index: number) => void;
  onUpdateMember: (id: string, patch: Partial<AssignedMember>) => void;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
  onUpdateLead: (id: string, patch: Partial<AssignedMember>) => void;
  onAddLead: () => void;
  onRemoveLead: (id: string) => void;
}) {
  const members = gian.assignedMembers ?? [];
  const leads = gian.assignedLeads ?? [];
  const lom = useLomName();
  return (
    <section className={styles.card}>
      <div className={styles.lom}>{gian.lomName || lom}</div>
      {!kihon && (
        <div className={styles.meeting}>
          <input
            className={styles.meetingInput}
            value={gian.submissionMeeting}
            readOnly={readOnly}
            size={Math.max(6, gian.submissionMeeting.length + 1)}
            placeholder="3月度定例理事会"
            onChange={(e) => onField("submissionMeeting", e.target.value)}
          />
          提案議題
        </div>
      )}

      <label className={styles.label}>{kihon ? "件名" : "提案議題"}</label>
      <input
        type="text"
        value={gian.topic}
        readOnly={readOnly}
        onChange={(e) => onField("topic", e.target.value)}
        className={styles.mb10}
      />

      {kihon ? (
        <>
          <div className={styles.bullet}>● 担当</div>
          <PersonTable
            rows={leads}
            readOnly={readOnly}
            onUpdate={onUpdateLead}
            onAdd={onAddLead}
            onRemove={onRemoveLead}
            addLabel="＋ 担当を追加"
            rolePlaceholder="担当副理事長"
          />
          <div className={styles.bullet} style={{ marginTop: 14 }}>
            ● 配属メンバー
          </div>
          <PersonTable
            rows={members}
            readOnly={readOnly}
            onUpdate={onUpdateMember}
            onAdd={onAddMember}
            onRemove={onRemoveMember}
            addLabel="＋ メンバーを追加"
            rolePlaceholder="事務局長"
          />
        </>
      ) : (
        <>
          <p className={styles.proposalLine}>
            表記議題について以下の明細をもって{" "}
            <Editable
              readOnly={readOnly}
              value={gian.proposalType}
              onChange={(v) => onField("proposalType", v)}
              bold
            />{" "}
            として提案します。
          </p>
          <div className={styles.proposalMeta}>
            <Editable
              readOnly={readOnly}
              value={gian.proposalDate}
              onChange={(v) => onField("proposalDate", v)}
            />
            <span>
              <Editable
                readOnly={readOnly}
                value={gian.proposerRole}
                onChange={(v) => onField("proposerRole", v)}
              />
              {"　"}
              <Editable
                readOnly={readOnly}
                value={gian.proposerName}
                onChange={(v) => onField("proposerName", v)}
              />
            </span>
          </div>

          <div className={styles.divider} />

          <div className={styles.fieldGrid}>
            <FieldRow
              label="文書作成者"
              value={gian.author}
              readOnly={readOnly}
              onChange={(v) => onField("author", v)}
            />
            <FieldRow
              label="作成日時"
              value={gian.createdAt}
              readOnly={readOnly}
              onChange={(v) => onField("createdAt", v)}
            />
            <FieldRow
              label="礼状の発送"
              value={gian.courtesyLetter}
              readOnly={readOnly}
              onChange={(v) => onField("courtesyLetter", v)}
            />
            <FieldRow
              label="メディア依頼書"
              value={gian.mediaRequest}
              readOnly={readOnly}
              onChange={(v) => onField("mediaRequest", v)}
            />
          </div>
        </>
      )}

      {!kihon && (
        <>
      <div className={styles.bullet}>● 議案上程スケジュール</div>
      <div className={styles.scheduleWrap}>
        <table className={styles.schedule}>
          <thead>
            <tr>
              <th>回数</th>
              <th>上程会議名</th>
              <th>会議開催日時</th>
              <th>上程形式</th>
              {!readOnly && <th style={{ width: 40 }} aria-label="操作" />}
            </tr>
          </thead>
          <tbody>
            {gian.submissionSchedule.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 4 : 5} className={styles.schedEmpty}>
                  （行を追加してください）
                </td>
              </tr>
            )}
            {gian.submissionSchedule.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    className={styles.schedCell}
                    value={row.round}
                    readOnly={readOnly}
                    placeholder="3月度"
                    onChange={(e) =>
                      onUpdateSubmissionRow(i, { round: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.schedCell}
                    value={row.meeting}
                    readOnly={readOnly}
                    placeholder="定例理事会"
                    onChange={(e) =>
                      onUpdateSubmissionRow(i, { meeting: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.schedCell}
                    value={row.date}
                    readOnly={readOnly}
                    placeholder="2026年03月03日"
                    onChange={(e) =>
                      onUpdateSubmissionRow(i, { date: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.schedCell}
                    value={row.format}
                    readOnly={readOnly}
                    placeholder="審議"
                    onChange={(e) =>
                      onUpdateSubmissionRow(i, { format: e.target.value })
                    }
                  />
                </td>
                {!readOnly && (
                  <td>
                    <button
                      type="button"
                      className={styles.schedDel}
                      title="この行を削除"
                      onClick={() => onRemoveSubmissionRow(i)}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          type="button"
          className={styles.dashed}
          onClick={onAddSubmissionRow}
        >
          ＋ 上程スケジュールの行を追加
        </button>
      )}

      <div className={styles.confirmRow}>
        <span className={styles.fieldLabel}>● 確認日</span>
        <span className={styles.fieldColon}>：</span>
        <span className={styles.confirmInputs}>
            <input
              className={styles.fieldInput}
              value={gian.confirmerRole ?? ""}
              placeholder="役職名"
              readOnly={readOnly}
              onChange={(e) => onField("confirmerRole", e.target.value)}
            />
            <input
              className={styles.fieldInput}
              value={gian.confirmerName ?? ""}
              placeholder="名前"
              readOnly={readOnly}
              onChange={(e) => onField("confirmerName", e.target.value)}
            />
            <input
              className={styles.fieldInput}
              value={gian.vpConfirmDate}
              placeholder="日付"
              readOnly={readOnly}
              onChange={(e) => onField("vpConfirmDate", e.target.value)}
            />
          </span>
      </div>
        </>
      )}
    </section>
  );
}

/** 基本方針：委員会予算（収入の部／支出の部） */
function CommitteeBudgetSection({
  budget,
  readOnly,
  onUpdate,
  onAdd,
  onRemove,
}: {
  budget: { income: BudgetLine[]; expense: BudgetLine[] };
  readOnly: boolean;
  onUpdate: (
    part: "income" | "expense",
    id: string,
    patch: Partial<BudgetLine>
  ) => void;
  onAdd: (part: "income" | "expense") => void;
  onRemove: (part: "income" | "expense", id: string) => void;
}) {
  const col = (part: "income" | "expense", title: string) => {
    const lines = budget[part];
    const total = sumAmounts(lines);
    return (
      <div className={styles.budgetCol}>
        <div className={styles.budgetColTitle}>{title}</div>
        <div className={styles.scheduleWrap}>
          <table className={styles.schedule}>
            <thead>
              <tr>
                <th>科目</th>
                <th style={{ width: "38%" }}>金額</th>
                {!readOnly && <th style={{ width: 40 }} aria-label="操作" />}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 2 : 3} className={styles.schedEmpty}>
                    （未記入）
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      className={styles.schedCell}
                      value={l.label}
                      readOnly={readOnly}
                      placeholder="事業費繰入収入"
                      onChange={(e) =>
                        onUpdate(part, l.id, { label: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={styles.schedCell}
                      value={l.amount}
                      readOnly={readOnly}
                      placeholder="￥0-"
                      onChange={(e) =>
                        onUpdate(part, l.id, { amount: e.target.value })
                      }
                    />
                  </td>
                  {!readOnly && (
                    <td>
                      <button
                        type="button"
                        className={styles.schedDel}
                        title="この行を削除"
                        onClick={() => onRemove(part, l.id)}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className={styles.budgetTotalRow}>
                <td>合計</td>
                <td>￥{jpNum(total)}-</td>
                {!readOnly && <td />}
              </tr>
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <button
            type="button"
            className={styles.dashed}
            onClick={() => onAdd(part)}
          >
            ＋ 行を追加
          </button>
        )}
      </div>
    );
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>委員会予算</div>
      <div className={styles.budgetGrid}>
        {col("income", "収入の部")}
        {col("expense", "支出の部")}
      </div>
    </section>
  );
}

function PriorFeedbackSection({
  rounds,
  readOnly,
  onUpdateRound,
  onAddRound,
  onRemoveRound,
  onUpdateExchange,
  onAddExchange,
  onRemoveExchange,
  onClearAll,
}: {
  rounds: FeedbackRound[];
  readOnly: boolean;
  onUpdateRound: (roundId: string, patch: Partial<FeedbackRound>) => void;
  onAddRound: () => void;
  onRemoveRound: (roundId: string) => void;
  onUpdateExchange: (
    roundId: string,
    exId: string,
    patch: Partial<FeedbackExchange>
  ) => void;
  onAddExchange: (roundId: string) => void;
  onRemoveExchange: (roundId: string, exId: string) => void;
  /** すべて削除（外部配信前用） */
  onClearAll?: () => void;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>
        前回までの流れ（意見と対応）
        {!readOnly && onClearAll && rounds.length > 0 && (
          <button
            type="button"
            className={styles.clearAllBtn}
            title="外部配信前に内部の審議経過をまとめて削除します"
            onClick={onClearAll}
          >
            すべて削除（配信前）
          </button>
        )}
      </div>
      <div className={styles.fbRounds}>
        {rounds.length === 0 && (
          <p className={styles.feedbackEmpty}>
            前回までの流れはまだありません（初回上程）。
          </p>
        )}

        {rounds.map((r) => (
          <div key={r.id} className={styles.fbRound}>
            {/* 会議の見出し行 */}
            <div className={styles.fbRoundHead}>
              <span className={styles.fbBullet}>●</span>
              <input
                className={styles.fbMeetingInput}
                value={r.meetingName}
                readOnly={readOnly}
                placeholder="会議名（例：第1回理事三役会）"
                onChange={(e) =>
                  onUpdateRound(r.id, { meetingName: e.target.value })
                }
              />
              <span className={styles.fbBullet}>● 開催日</span>
              <input
                className={styles.fbDateInput}
                value={r.date}
                readOnly={readOnly}
                placeholder="2026年01月06日"
                onChange={(e) => onUpdateRound(r.id, { date: e.target.value })}
              />
              <select
                className={styles.fbFormatSelect}
                value={r.format}
                disabled={readOnly}
                onChange={(e) =>
                  onUpdateRound(r.id, { format: e.target.value })
                }
              >
                <option value="協議">協議</option>
                <option value="審議">審議</option>
                <option value="協議・審議">協議・審議</option>
              </select>
              {!readOnly && (
                <button
                  type="button"
                  className={styles.fbRoundRemove}
                  title="この会議ぶんを削除"
                  onClick={() => onRemoveRound(r.id)}
                >
                  ×
                </button>
              )}
            </div>

            {/* 意見N／対応N の表 */}
            <div className={styles.fbTable}>
              {r.exchanges.map((ex, i) => (
                <div key={ex.id} className={styles.fbExchange}>
                  <div className={styles.fbLine}>
                    <span className={styles.fbLineLabel}>意見 {i + 1}：</span>
                    <div className={styles.fbLineInput}>
                      <RichText
                        value={ex.opinion}
                        readOnly={readOnly}
                        placeholder="出された意見"
                        onChange={(html) =>
                          onUpdateExchange(r.id, ex.id, { opinion: html })
                        }
                      />
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className={styles.fbExRemove}
                        title="この意見・対応を削除"
                        onClick={() => onRemoveExchange(r.id, ex.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className={styles.fbLine}>
                    <span className={styles.fbLineLabel}>対応 {i + 1}：</span>
                    <div className={styles.fbLineInput}>
                      <RichText
                        value={ex.response}
                        readOnly={readOnly}
                        placeholder="対応内容"
                        onChange={(html) =>
                          onUpdateExchange(r.id, ex.id, { response: html })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!readOnly && (
              <button
                type="button"
                className={styles.dashed}
                onClick={() => onAddExchange(r.id)}
              >
                ＋ 意見・対応を追加
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <button type="button" className={styles.dashed} onClick={onAddRound}>
            ＋ 会議を追加
          </button>
        )}
      </div>
    </section>
  );
}

interface LinkOption {
  id: string;
  topic: string;
  kind: string;
}

/** 項目の「添付追加」で使う候補（他の議案・この議案の資料）＋更新ハンドラ */
export interface AttachContext {
  gianGroups: { committee: string; gians: { id: string; label: string }[] }[];
  files: GianFileMeta[];
  onChange: (no: number, attachments: ItemLink[]) => void;
}

function genLinkId(): string {
  return `il-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 項目に添付したリンク（他の議案・資料）の表示＋編集 */
function ItemAttachments({
  item,
  readOnly,
  attach,
}: {
  item: TemplateItem;
  readOnly: boolean;
  attach: AttachContext;
}) {
  const [picking, setPicking] = useState<null | "gian" | "file">(null);
  const list = item.attachments ?? [];

  const add = (link: ItemLink) => {
    attach.onChange(item.no, [...list, link]);
    setPicking(null);
  };
  const remove = (id: string) =>
    attach.onChange(
      item.no,
      list.filter((l) => l.id !== id)
    );

  return (
    <div className={styles.attachWrap}>
      {list.length > 0 && (
        <div className={styles.attachChips}>
          {list.map((l) => (
            <span key={l.id} className={styles.attachChip}>
              <span className={styles.attachChipIcon}>
                {l.kind === "gian" ? "📄" : "📎"}
              </span>
              {l.kind === "gian" ? (
                <a
                  href={`/gian/${l.gianId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.attachChipLink}
                >
                  {l.label}
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.attachChipLink}
                  onClick={() =>
                    l.fileId && openFileByIdAsync(l.fileId, l.label)
                  }
                >
                  {l.label}
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className={styles.attachChipX}
                  title="この添付を外す"
                  onClick={() => remove(l.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className={styles.attachTools}>
          {picking === null ? (
            <button
              type="button"
              className={styles.attachAddBtn}
              onClick={() => setPicking("gian")}
            >
              ＋ 添付追加
            </button>
          ) : (
            <>
              <div className={styles.attachPickTabs}>
                <button
                  type="button"
                  className={`${styles.attachPickTab} ${
                    picking === "gian" ? styles.attachPickTabOn : ""
                  }`}
                  onClick={() => setPicking("gian")}
                >
                  議案
                </button>
                <button
                  type="button"
                  className={`${styles.attachPickTab} ${
                    picking === "file" ? styles.attachPickTabOn : ""
                  }`}
                  onClick={() => setPicking("file")}
                >
                  資料
                </button>
              </div>
              {picking === "gian" ? (
                <select
                  className={styles.attachSelect}
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    let label = id;
                    for (const g of attach.gianGroups) {
                      const hit = g.gians.find((x) => x.id === id);
                      if (hit) {
                        label = hit.label;
                        break;
                      }
                    }
                    add({ id: genLinkId(), kind: "gian", gianId: id, label });
                  }}
                >
                  <option value="">議案を選ぶ…</option>
                  {attach.gianGroups.map((g) => (
                    <optgroup key={g.committee} label={g.committee}>
                      {g.gians.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <select
                  className={styles.attachSelect}
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const f = attach.files.find((x) => x.id === id);
                    add({
                      id: genLinkId(),
                      kind: "file",
                      fileId: id,
                      label: f?.name ?? "資料",
                    });
                  }}
                >
                  <option value="">
                    {attach.files.length === 0
                      ? "この議案に資料がありません"
                      : "資料を選ぶ…"}
                  </option>
                  {attach.files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className={styles.attachCancel}
                onClick={() => setPicking(null)}
              >
                閉じる
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateSection({
  title,
  items,
  readOnly,
  onChange,
  schedule,
  onScheduleChange,
  onScheduleAdd,
  onScheduleRemove,
  budgetLink,
  attach,
}: {
  title: string;
  items: TemplateItem[];
  readOnly: boolean;
  onChange: (no: number, body: string) => void;
  /** 「実施までのスケジュール」項目の中身（日付／内容の表）。渡された時だけ表で描画 */
  schedule?: ScheduleEntry[];
  onScheduleChange?: (id: string, patch: Partial<ScheduleEntry>) => void;
  onScheduleAdd?: () => void;
  onScheduleRemove?: (id: string) => void;
  /** 「予算総額」項目に事業収支予算書へのリンクを出す */
  budgetLink?: {
    hasBudget: boolean;
    total: number | null;
    onOpen: () => void;
  };
  /** 各項目に「添付追加」（他の議案・資料へのリンク）を出す */
  attach?: AttachContext;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>
        {title}
        <span className={styles.sectionCount}>全{items.length}項目</span>
      </div>
      <div className={styles.stack}>
        {items.map((item) =>
          schedule && item.label === SCHEDULE_ITEM_LABEL ? (
            <div key={item.no} className={styles.tplCard}>
              <div className={styles.tplHead}>
                <span className={styles.tplNo}>{item.no}</span>
                <span className={styles.tplLabel}>{item.label}</span>
              </div>
              <ScheduleTable
                entries={schedule}
                readOnly={readOnly}
                onChange={onScheduleChange}
                onAdd={onScheduleAdd}
                onRemove={onScheduleRemove}
              />
            </div>
          ) : (
            <div key={item.no} className={styles.tplCard}>
              <TemplateCard
                item={item}
                readOnly={readOnly}
                onChange={(body) => onChange(item.no, body)}
                bare
                footer={
                  attach ? (
                    <ItemAttachments
                      item={item}
                      readOnly={readOnly}
                      attach={attach}
                    />
                  ) : undefined
                }
              />
              {budgetLink && item.label === BUDGET_ITEM_LABEL && (
                <button
                  type="button"
                  className={styles.budgetLinkBtn}
                  onClick={budgetLink.onOpen}
                >
                  💰{" "}
                  {budgetLink.hasBudget
                    ? `事業収支予算書を開く（費用計 ¥${jpNum(
                        budgetLink.total ?? 0
                      )}）`
                    : "事業収支予算書を作成する"}{" "}
                  →
                </button>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}

/**
 * 基本方針の「事業計画」セクション。
 * 各項目は 上段＝事業名（自由編集）／下段＝関連議案の紐づけ（協議議案のみ）。
 * 項目は自由に増減できる。
 */
function PlanItemsSection({
  items,
  readOnly,
  linkOptions,
  onChangeLabel,
  onChangeLink,
  onAdd,
  onRemove,
}: {
  items: TemplateItem[];
  readOnly: boolean;
  linkOptions: LinkOption[];
  onChangeLabel: (no: number, label: string) => void;
  onChangeLink: (no: number, linkedGianId: string | undefined) => void;
  onAdd: () => void;
  onRemove: (no: number) => void;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>
        事業計画
        <span className={styles.sectionCount}>全{items.length}項目</span>
      </div>
      <div className={styles.stack}>
        {items.length === 0 && (
          <p className={styles.feedbackEmpty}>
            事業がありません。「＋ 事業を追加」で追加してください。
          </p>
        )}
        {items.map((item) => {
          const linked = linkOptions.find((o) => o.id === item.linkedGianId);
          return (
            <div key={item.no} className={styles.tplCard}>
              <div className={styles.planItemHead}>
                <span className={styles.tplNo}>{item.no}</span>
                <input
                  className={styles.planNameInput}
                  value={item.label}
                  readOnly={readOnly}
                  placeholder="事業名（例：総会の運営について）"
                  onChange={(e) => onChangeLabel(item.no, e.target.value)}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className={styles.schedDel}
                    title="この事業を削除"
                    onClick={() => onRemove(item.no)}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className={styles.planLinkRow}>
                <span className={styles.planLinkLabel}>関連議案（協議）</span>
                {readOnly ? (
                  <span>{linked ? `協議議案：${linked.topic}` : "（なし）"}</span>
                ) : (
                  <select
                    className={styles.planLinkSelect}
                    value={item.linkedGianId ?? ""}
                    onChange={(e) =>
                      onChangeLink(item.no, e.target.value || undefined)
                    }
                  >
                    <option value="">（リンクなし）</option>
                    {linkOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        協議議案：{o.topic}
                      </option>
                    ))}
                  </select>
                )}
                {linked && (
                  <a
                    href={`/gian/${linked.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.planLinkOpen}
                  >
                    開く ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <button type="button" className={styles.dashed} onClick={onAdd}>
          ＋ 事業を追加
        </button>
      )}
    </section>
  );
}

function TemplateCard({
  item,
  readOnly,
  onChange,
  bare,
  footer,
}: {
  item: TemplateItem;
  readOnly: boolean;
  onChange: (body: string) => void;
  /** 外側で .tplCard をラップする場合は中身だけ描画 */
  bare?: boolean;
  footer?: React.ReactNode;
}) {
  const empty = isRichEmpty(item.body);
  const inner = (
    <>
      <div className={styles.tplHead}>
        <span className={styles.tplNo}>{item.no}</span>
        <span className={styles.tplLabel}>{item.label}</span>
        {empty && <span className={styles.unfilled}>未記入</span>}
      </div>
      <RichText
        value={item.body}
        readOnly={readOnly}
        placeholder="ここに内容を記入します"
        onChange={onChange}
      />
      {footer}
    </>
  );
  return bare ? inner : <div className={styles.tplCard}>{inner}</div>;
}

function ScheduleTable({
  entries,
  readOnly,
  onChange,
  onAdd,
  onRemove,
}: {
  entries: ScheduleEntry[];
  readOnly: boolean;
  onChange?: (id: string, patch: Partial<ScheduleEntry>) => void;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={styles.schedBlock}>
      <div className={styles.schedTableWrap}>
        <table className={styles.schedTable}>
          <thead>
            <tr>
              <th className={styles.schedThDate}>日付</th>
              <th>内容</th>
              {!readOnly && <th className={styles.schedThAct} aria-label="操作" />}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 2 : 3} className={styles.schedEmpty}>
                  行がありません
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <input
                    className={styles.schedInput}
                    value={e.date}
                    readOnly={readOnly}
                    placeholder="2026年4月19日"
                    onChange={(ev) =>
                      onChange?.(e.id, { date: ev.target.value })
                    }
                  />
                </td>
                <td>
                  <RichText
                    value={e.content}
                    readOnly={readOnly}
                    placeholder="内容"
                    onChange={(html) => onChange?.(e.id, { content: html })}
                  />
                </td>
                {!readOnly && (
                  <td className={styles.schedTdAct}>
                    <button
                      type="button"
                      className={styles.rowRemove}
                      title="この行を削除"
                      onClick={() => onRemove?.(e.id)}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button type="button" className={styles.dashed} onClick={onAdd}>
          ＋ 行を追加
        </button>
      )}
    </div>
  );
}

function FieldRow({
  label,
  value,
  placeholder,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>● {label}</span>
      <span className={styles.fieldColon}>：</span>
      <input
        className={styles.fieldInput}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Editable({
  value,
  onChange,
  readOnly,
  bold,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  bold?: boolean;
}) {
  return (
    <input
      className={`${styles.editable} ${bold ? styles.editableBold : ""}`}
      value={value}
      readOnly={readOnly}
      size={Math.max(4, value.length)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ───────────────────────── 上程フロー・履歴 ───────────────────────── */

const REQ_LABEL: Record<ReplacementStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
};

const fmtDateTime = formatJaDateTime;

function FlowPanel({
  gian,
  snapshots,
  requests,
  canApprove,
  onDecide,
  onDistribution,
}: {
  gian: Gian;
  snapshots: Snapshot[];
  requests: ReplacementRequest[];
  canApprove: boolean;
  onDecide: (requestId: string, approve: boolean) => void;
  onDistribution: () => void;
}) {
  const [openSnap, setOpenSnap] = useState<string | null>(null);

  const hint =
    gian.status === "editing"
      ? "委員会メンバーが自由に編集できます。「会議へ上程」でその時点のスナップショットを保存し、上程済みに移行します。"
      : gian.status === "submitted"
        ? "本文・資料一覧は編集ロック中です。変更するには「差し替え申請」→ 承認が必要です。"
        : "配信確定済み。完全ロックされています。";

  return (
    <section className={styles.card}>
      <div className={styles.cardHeading}>上程フロー・履歴</div>

      <div className={styles.flowStatus}>
        <span>
          現在の状態：
          <strong className={`${styles.flowBadge} ${styles[gian.status]}`}>
            {STATUS_LABEL[gian.status]}
          </strong>
        </span>
        <span className={styles.flowHint}>{hint}</span>
      </div>

      {requests.length > 0 && (
        <div className={styles.reqBlock}>
          <div className={styles.subHead}>差し替え申請</div>
          {[...requests].reverse().map((r) => (
            <div key={r.id} className={styles.reqRow}>
              <span
                className={`${styles.reqStatus} ${
                  r.status === "pending"
                    ? styles.reqPending
                    : r.status === "approved"
                      ? styles.reqApproved
                      : styles.reqRejected
                }`}
              >
                {REQ_LABEL[r.status]}
              </span>
              <span className={styles.reqNote}>{r.note}</span>
              <span className={styles.reqDate}>{fmtDateTime(r.requestedAt)}</span>
              {r.status === "pending" &&
                (canApprove ? (
                  <span className={styles.reqActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => onDecide(r.id, true)}
                    >
                      承認（仮）
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => onDecide(r.id, false)}
                    >
                      却下（仮）
                    </button>
                  </span>
                ) : (
                  <span className={styles.reqNote}>
                    （承認は「差し替え申請の承認」権限を持つロールのみ）
                  </span>
                ))}
            </div>
          ))}
          <p className={styles.autoNote}>
            ※ 承認機能は仮実装です（承認すると状態を「編集中」に戻します）。
          </p>
        </div>
      )}

      <div className={styles.subHead}>
        スナップショット履歴（{snapshots.length}）
      </div>
      <p className={styles.snapLegend}>
        <span className={`${styles.snapKind} ${styles.snapKindSubmission}`}>
          📌 上程時
        </span>
        正式な記録・永続保存　／
        <span className={`${styles.snapKind} ${styles.snapKindAutosave}`}>
          💾 下書き・同期
        </span>
        保険用の一時記録・直近 {AUTOSAVE_LIMIT} 件のみ
      </p>
      {snapshots.length === 0 ? (
        <p className={styles.feedbackEmpty}>
          まだありません（上程・下書き保存・同期で保存されます）。
        </p>
      ) : (
        <div className={styles.snapList}>
          {[...snapshots].reverse().map((s) => {
            const open = openSnap === s.id;
            const isSubmission = s.kind === "submission";
            return (
              <div
                key={s.id}
                className={`${styles.snapItem} ${
                  isSubmission
                    ? styles.snapItemSubmission
                    : styles.snapItemAutosave
                }`}
              >
                <button
                  type="button"
                  className={styles.snapToggle}
                  onClick={() => setOpenSnap(open ? null : s.id)}
                >
                  <span className={styles.caret}>{open ? "▾" : "▸"}</span>
                  <span
                    className={`${styles.snapKind} ${
                      isSubmission
                        ? styles.snapKindSubmission
                        : styles.snapKindAutosave
                    }`}
                  >
                    {isSubmission ? "📌 上程時" : "💾 下書き・同期"}
                  </span>
                  <span className={styles.snapReason}>{s.reason}</span>
                  <span className={styles.snapDate}>{fmtDateTime(s.takenAt)}</span>
                </button>
                {open && (
                  <SnapshotDetail
                    gian={s.gian}
                    gianId={gian.id}
                    snapshotId={s.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {gian.status === "submitted" && (
        <button
          type="button"
          className={styles.dashed}
          onClick={onDistribution}
        >
          配信確定にする（モック：本来は次第作成／配信フロー）
        </button>
      )}
    </section>
  );
}

function SnapshotDetail({
  gian,
  gianId,
  snapshotId,
}: {
  gian: Gian;
  gianId: string;
  snapshotId: string;
}) {
  const filled = (items: { body: string }[]) =>
    items.filter((i) => i.body.trim() !== "").length;
  return (
    <div className={styles.snapDetail}>
      <Link
        href={`/gian/${gianId}/view?snap=${snapshotId}`}
        className={styles.linkBtn}
      >
        この時点の内容を全文表示 →
      </Link>
      <div className={styles.snapKv}>
        <span>提案議題</span>
        <span>{gian.topic}</span>
      </div>
      <div className={styles.snapKv}>
        <span>提案日</span>
        <span>{gian.proposalDate}</span>
      </div>
      <div className={styles.snapKv}>
        <span>事業要綱</span>
        <span>
          {filled(gian.outline)}/{gian.outline.length} 記入
        </span>
      </div>
      <div className={styles.snapKv}>
        <span>事業概要</span>
        <span>
          {filled(gian.overview)}/{gian.overview.length} 記入
        </span>
      </div>
    </div>
  );
}
