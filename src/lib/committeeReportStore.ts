"use client";

// ─────────────────────────────────────────────────────────────
// 委員会報告ストア（本番: Supabase committee_reports）
//   委員会ごとに1レコード。会議のたびに meetings に1行追記していく運用。
// ─────────────────────────────────────────────────────────────

import { db, fire } from "./backend/client";

export interface ReportMeeting {
  id: string;
  /** 開催日（自由入力：2026年01月08日 など） */
  date: string;
  /** 出席者（改行区切り・自由入力） */
  attendees: string;
  /** 内容（リッチテキスト HTML） */
  content: string;
}

export interface CommitteeReport {
  id: string;
  yearId: string;
  committeeId: string;
  committeeName: string;
  meetings: ReportMeeting[];
  createdAt: string;
  updatedAt: string;
}

export type CommitteeReportStore = Record<string, CommitteeReport>;

let seq = 0;
function newId(p: string): string {
  seq += 1;
  return `${p}-${Date.now().toString(36)}-${seq}`;
}

export function blankMeeting(): ReportMeeting {
  return { id: newId("rm"), date: "", attendees: "", content: "" };
}

function normalize(raw: Partial<CommitteeReport>): CommitteeReport {
  const now = new Date().toISOString();
  return {
    id: raw.id ?? newId("crep"),
    yearId: raw.yearId ?? "",
    committeeId: raw.committeeId ?? "",
    committeeName: raw.committeeName ?? "",
    meetings: Array.isArray(raw.meetings)
      ? raw.meetings.map((m) => ({
          id: m.id || newId("rm"),
          date: typeof m.date === "string" ? m.date : "",
          attendees: typeof m.attendees === "string" ? m.attendees : "",
          content: typeof m.content === "string" ? m.content : "",
        }))
      : [],
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

// ── キャッシュ ──
let cache: CommitteeReportStore = {};
let hydrated = false;
const EMPTY: CommitteeReportStore = {};
const listeners = new Set<() => void>();

export function isHydrated(): boolean {
  return hydrated;
}
function notify() {
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getStore(): CommitteeReportStore {
  return cache;
}
export function getStoreDefault(): CommitteeReportStore {
  return EMPTY;
}

type Row = {
  id: string;
  fiscal_year_id: string;
  committee_id: string;
  committee_name: string;
  doc: CommitteeReport;
  created_at: string;
  updated_at: string;
};

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("committee_reports").select("*");
  if (error) {
    console.error("[committeeReportStore] hydrate 失敗:", error.message);
    return;
  }
  const next: CommitteeReportStore = {};
  for (const r of (data ?? []) as Row[]) {
    next[r.id] = normalize({
      ...r.doc,
      id: r.id,
      yearId: r.fiscal_year_id,
      committeeId: r.committee_id,
      committeeName: r.committee_name || r.doc.committeeName,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  cache = next;
  hydrated = true;
  notify();
}

export function reportForCommittee(
  committeeId: string
): CommitteeReport | undefined {
  return Object.values(cache).find((r) => r.committeeId === committeeId);
}

// ── 永続化 ──
async function persist(id: string): Promise<void> {
  const r = cache[id];
  if (!r) return;
  const { error } = await db().from("committee_reports").upsert({
    id,
    fiscal_year_id: r.yearId,
    committee_id: r.committeeId,
    committee_name: r.committeeName,
    doc: r,
    updated_at: r.updatedAt,
  });
  if (error) console.error("[committeeReportStore] 保存失敗:", error.message);
}

function set(id: string, r: CommitteeReport) {
  cache = { ...cache, [id]: r };
  notify();
}

// ── 変更操作 ──

/** 委員会の報告を取得（無ければ作成して返す） */
export function ensureReport(opts: {
  yearId: string;
  committeeId: string;
  committeeName: string;
}): string {
  const found = reportForCommittee(opts.committeeId);
  if (found) return found.id;
  const now = new Date().toISOString();
  const r = normalize({
    yearId: opts.yearId,
    committeeId: opts.committeeId,
    committeeName: opts.committeeName,
    meetings: [],
    createdAt: now,
    updatedAt: now,
  });
  set(r.id, r);
  void persist(r.id);
  return r.id;
}

export function saveReport(id: string, doc: CommitteeReport): void {
  set(id, { ...doc, updatedAt: new Date().toISOString() });
  void persist(id);
}

export function deleteReport(id: string): void {
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  fire(db().from("committee_reports").delete().eq("id", id));
}
