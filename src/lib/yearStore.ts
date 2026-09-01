"use client";

// ─────────────────────────────────────────────────────────────
// 年度フォルダ / 組織構造ストア（本番: Supabase）
//
//  fiscal_years / committees / role_assignments の3テーブルを起動時に
//  読み込み、FiscalYear ツリーへ組み立てる。委員会の gianIds は
//  gians.committee_id が真実で、gianStore 側から同期する（派生フィールド）。
// ─────────────────────────────────────────────────────────────

import { db } from "./backend/client";

/** 予定者期間 / 本番期間 */
export type Period = "planned" | "live";

export const PERIOD_LABEL: Record<Period, string> = {
  planned: "予定者期間",
  live: "本年度",
};

export type Role =
  | "master"
  | "president"
  | "executive_director"
  | "vice_president"
  | "auditor"
  | "secretary_general"
  | "committee_chair"
  | "committee_member"
  | "director";

export const ROLE_LABEL: Record<Role, string> = {
  master: "マスター",
  president: "理事長",
  executive_director: "専務",
  vice_president: "副理事長",
  auditor: "監事",
  secretary_general: "事務局長",
  committee_chair: "委員長",
  committee_member: "委員会メンバー",
  director: "理事",
};

export const SELECTABLE_ROLES: Role[] = [
  "president",
  "executive_director",
  "vice_president",
  "auditor",
  "secretary_general",
  "committee_chair",
  "committee_member",
  "director",
];

export interface Committee {
  id: string;
  name: string;
  /** この委員会の議案 id（gianStore から同期される派生フィールド） */
  gianIds: string[];
  /** 並び順（内部用） */
  sortOrder?: number;
}

export interface RoleAssignment {
  memberId: string;
  role: Role;
  committeeId?: string | null;
}

export interface FiscalYear {
  id: string;
  label: string;
  plannedPeriodLabel: string;
  livePeriodLabel: string;
  committees: Committee[];
  assignments: RoleAssignment[];
  sortOrder?: number;
}

export type YearStore = Record<string, FiscalYear>;

// ── キャッシュ ──
let cache: YearStore = {};
let hydrated = false;
const EMPTY: YearStore = {};
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

type YearRow = {
  id: string;
  label: string;
  planned_period_label: string;
  live_period_label: string;
  sort_order: number;
};
type CommitteeRow = {
  id: string;
  fiscal_year_id: string;
  name: string;
  sort_order: number;
};
type AssignmentRow = {
  fiscal_year_id: string;
  member_id: string;
  role: Role;
  committee_id: string | null;
};

export async function hydrate(): Promise<void> {
  const [years, committees, assignments] = await Promise.all([
    db().from("fiscal_years").select("*"),
    db().from("committees").select("*"),
    db().from("role_assignments").select("*"),
  ]);
  if (years.error || committees.error || assignments.error) {
    console.error(
      "[yearStore] hydrate 失敗:",
      years.error?.message || committees.error?.message || assignments.error?.message
    );
    return;
  }

  // 既存の gianIds を保持（gianStore が後から同期する場合の取りこぼし防止）
  const prevGianIds = new Map<string, string[]>();
  for (const y of Object.values(cache))
    for (const c of y.committees) prevGianIds.set(c.id, c.gianIds);

  const next: YearStore = {};
  for (const r of (years.data ?? []) as YearRow[]) {
    next[r.id] = {
      id: r.id,
      label: r.label,
      plannedPeriodLabel: r.planned_period_label,
      livePeriodLabel: r.live_period_label,
      sortOrder: r.sort_order,
      committees: [],
      assignments: [],
    };
  }
  for (const c of (committees.data ?? []) as CommitteeRow[]) {
    next[c.fiscal_year_id]?.committees.push({
      id: c.id,
      name: c.name,
      sortOrder: c.sort_order,
      gianIds: prevGianIds.get(c.id) ?? [],
    });
  }
  for (const y of Object.values(next))
    y.committees.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const a of (assignments.data ?? []) as AssignmentRow[]) {
    next[a.fiscal_year_id]?.assignments.push({
      memberId: a.member_id,
      role: a.role,
      committeeId: a.committee_id,
    });
  }

  cache = next;
  hydrated = true;
  notify();
}

/** gianStore から呼ばれる：委員会 → 議案id の対応を再構築 */
export function syncCommitteeGians(
  pairs: Array<{ gianId: string; committeeId: string | null }>
): void {
  const byCommittee = new Map<string, string[]>();
  for (const { gianId, committeeId } of pairs) {
    if (!committeeId) continue;
    const arr = byCommittee.get(committeeId) ?? [];
    arr.push(gianId);
    byCommittee.set(committeeId, arr);
  }
  const next: YearStore = {};
  for (const [yid, year] of Object.entries(cache)) {
    next[yid] = {
      ...year,
      committees: year.committees.map((c) => ({
        ...c,
        gianIds: byCommittee.get(c.id) ?? [],
      })),
    };
  }
  cache = next;
  notify();
}

// ── 読み取り ──
export function getStore(): YearStore {
  return cache;
}
export function getStoreDefault(): YearStore {
  return EMPTY;
}
export function getYear(id: string): FiscalYear | undefined {
  return cache[id];
}
export function getYearDefault(): FiscalYear | undefined {
  return undefined;
}

export function listYears(): FiscalYear[] {
  return Object.values(cache).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
}

/** タブ表示順（sortOrder 昇順の id 配列） */
export const YEAR_ORDER: string[] = [];

export function roleOf(yearId: string, memberId: string | null): Role {
  if (!memberId) return "committee_member";
  const a = cache[yearId]?.assignments.find((x) => x.memberId === memberId);
  return a?.role ?? "committee_member";
}

export function findCommittee(
  committeeId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(cache)) {
    const committee = year.committees.find((c) => c.id === committeeId);
    if (committee) return { year, committee };
  }
  return undefined;
}
export const findCommitteeDefault = (): undefined => undefined;

export function findCommitteeByGian(
  gianId: string
): { year: FiscalYear; committee: Committee } | undefined {
  for (const year of Object.values(cache)) {
    const committee = year.committees.find((c) => c.gianIds.includes(gianId));
    if (committee) return { year, committee };
  }
  return undefined;
}
export const findCommitteeByGianDefault = (): undefined => undefined;

export function committeeOf(
  yearId: string,
  memberId: string | null
): Committee | undefined {
  if (!memberId) return undefined;
  const a = cache[yearId]?.assignments.find((x) => x.memberId === memberId);
  if (!a?.committeeId) return undefined;
  return cache[yearId]?.committees.find((c) => c.id === a.committeeId);
}

// ── 変更操作（楽観更新 ＋ Supabase 書き込み）──

function replaceYear(yearId: string, year: FiscalYear) {
  cache = { ...cache, [yearId]: year };
  notify();
}

export async function setAssignment(
  yearId: string,
  memberId: string,
  role: Role,
  committeeId?: string | null
): Promise<void> {
  const year = cache[yearId];
  if (!year) return;
  const rest = year.assignments.filter((a) => a.memberId !== memberId);
  const next: RoleAssignment = { memberId, role, committeeId: committeeId ?? null };
  replaceYear(yearId, { ...year, assignments: [...rest, next] });

  await db().from("role_assignments").upsert(
    {
      fiscal_year_id: yearId,
      member_id: memberId,
      role,
      committee_id: committeeId ?? null,
    },
    { onConflict: "fiscal_year_id,member_id" }
  );
}

export function addGianToCommittee(committeeId: string, gianId: string): void {
  for (const [yid, year] of Object.entries(cache)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committee = year.committees[idx];
    if (committee.gianIds.includes(gianId)) return;
    const committees = [...year.committees];
    committees[idx] = { ...committee, gianIds: [...committee.gianIds, gianId] };
    replaceYear(yid, { ...year, committees });
    return;
  }
}

export function removeGianFromCommittee(committeeId: string, gianId: string): void {
  for (const [yid, year] of Object.entries(cache)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committee = year.committees[idx];
    const committees = [...year.committees];
    committees[idx] = {
      ...committee,
      gianIds: committee.gianIds.filter((g) => g !== gianId),
    };
    replaceYear(yid, { ...year, committees });
    return;
  }
}

export async function addCommittee(
  yearId: string,
  name: string
): Promise<string | null> {
  const n = name.trim();
  const year = cache[yearId];
  if (!n || !year) return null;
  const id = `cm-${yearId.replace("fy-", "")}-${Date.now().toString(36)}`;
  const sortOrder = (year.committees.at(-1)?.sortOrder ?? 0) + 1;
  replaceYear(yearId, {
    ...year,
    committees: [...year.committees, { id, name: n, gianIds: [], sortOrder }],
  });
  await db().from("committees").insert({
    id,
    fiscal_year_id: yearId,
    name: n,
    sort_order: sortOrder,
  });
  return id;
}

export async function renameCommittee(
  committeeId: string,
  name: string
): Promise<void> {
  const n = name.trim();
  if (!n) return;
  for (const [yid, year] of Object.entries(cache)) {
    const idx = year.committees.findIndex((c) => c.id === committeeId);
    if (idx < 0) continue;
    const committees = [...year.committees];
    committees[idx] = { ...committees[idx], name: n };
    replaceYear(yid, { ...year, committees });
    break;
  }
  await db().from("committees").update({ name: n }).eq("id", committeeId);
}

export async function createYear(input: {
  id: string;
  label: string;
  plannedPeriodLabel?: string;
  livePeriodLabel?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db()
    .from("fiscal_years")
    .insert({
      id: input.id,
      label: input.label,
      planned_period_label: input.plannedPeriodLabel ?? "",
      live_period_label: input.livePeriodLabel ?? "",
      sort_order: Number(input.id.replace(/\D/g, "")) || 0,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  const r = data as YearRow;
  replaceYear(r.id, {
    id: r.id,
    label: r.label,
    plannedPeriodLabel: r.planned_period_label,
    livePeriodLabel: r.live_period_label,
    sortOrder: r.sort_order,
    committees: [],
    assignments: [],
  });
  return { ok: true };
}
