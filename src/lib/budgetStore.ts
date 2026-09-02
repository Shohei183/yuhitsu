"use client";

// ─────────────────────────────────────────────────────────────
// 事業収支予算書（様式1 収支予算書 ＋ 様式2・3 収益費用明細書）
//
//  budget_docs(doc jsonb) に保存。議案とは独立、gian_id で任意紐づけ。
//  各科目の「予算額」は明細行の合計（単一ソース）。
// ─────────────────────────────────────────────────────────────

import { db } from "./backend/client";
import { deleteFileObj } from "./backend/files";
import { parseAmount } from "./format";

/** 収益の科目（様式1・固定） */
export const REVENUE_CATEGORIES = [
  "登録料収益",
  "寄付金収益",
  "補助金",
  "助成金",
  "広告料収益",
  "販売収益",
  "事業繰入金",
  "雑収益",
] as const;

/** 費用の科目（様式1・固定） */
export const EXPENSE_CATEGORIES = [
  "会場設営費",
  "企画・演出費",
  "本部団関係費",
  "講師関係費",
  "広報費",
  "資料作成費",
  "報告書作成費",
  "懇親会費",
  "渉外費",
  "旅費交通費",
  "参加記念品費",
  "保険料",
  "通信費",
  "雑費",
  "予備費",
] as const;

/** 明細の1行（様式2・3） */
export interface BudgetLineItem {
  id: string;
  /** 細目 */
  subItem: string;
  /** 摘要（算出根拠など） */
  note: string;
  /** 金額（自由記入。¥や,は許容） */
  amount: string;
  /** 見積書などの添付ファイル（file_objects scope=budget の id） */
  attachmentId?: string | null;
  /** 添付ファイル名（表示・オープン用） */
  attachmentName?: string | null;
}

/** 科目（収益 or 費用）1件 */
export interface BudgetCategory {
  /** 科目名（固定リストの値） */
  name: string;
  /** 明細行。予算額 = この合計 */
  items: BudgetLineItem[];
}

export interface BudgetDoc {
  id: string;
  yearId: string;
  gianId: string | null;
  /** 事業名（例：4月度例会） */
  title: string;
  lomName: string;
  revenue: BudgetCategory[];
  expense: BudgetCategory[];
  createdAt: string;
  updatedAt: string;
}

export type BudgetStore = Record<string, BudgetDoc>;

const LOM_NAME = "一般社団法人小牧青年会議所";

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function blankLineItem(): BudgetLineItem {
  return { id: newId("bl"), subItem: "", note: "", amount: "" };
}

function blankDoc(yearId: string, gianId: string | null, title: string): BudgetDoc {
  const now = new Date().toISOString();
  return {
    id: newId("budget"),
    yearId,
    gianId,
    title,
    lomName: LOM_NAME,
    revenue: REVENUE_CATEGORIES.map((name) => ({ name, items: [] })),
    expense: EXPENSE_CATEGORIES.map((name) => ({ name, items: [] })),
    createdAt: now,
    updatedAt: now,
  };
}

/** 明細が壊れていてもコード既定の科目リストで補完 */
function normalize(raw: BudgetDoc): BudgetDoc {
  const fix = (cats: BudgetCategory[] | undefined, names: readonly string[]) =>
    names.map((name) => {
      const hit = (cats ?? []).find((c) => c.name === name);
      return {
        name,
        items: Array.isArray(hit?.items) ? hit!.items : [],
      };
    });
  return {
    ...raw,
    lomName: raw.lomName || LOM_NAME,
    revenue: fix(raw.revenue, REVENUE_CATEGORIES),
    expense: fix(raw.expense, EXPENSE_CATEGORIES),
  };
}

// ── 集計 ──
export function categoryTotal(c: BudgetCategory): number {
  return c.items.reduce((s, it) => s + parseAmount(it.amount), 0);
}
export function sectionTotal(cats: BudgetCategory[]): number {
  return cats.reduce((s, c) => s + categoryTotal(c), 0);
}
export function balance(d: BudgetDoc): number {
  return sectionTotal(d.revenue) - sectionTotal(d.expense);
}

// ── キャッシュ ──
let cache: BudgetStore = {};
let hydrated = false;
const EMPTY: BudgetStore = {};
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

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("budget_docs").select("*");
  if (error) {
    console.error("[budgetStore] hydrate 失敗:", error.message);
    return;
  }
  const next: BudgetStore = {};
  for (const r of (data ?? []) as {
    id: string;
    fiscal_year_id: string;
    gian_id: string | null;
    title: string;
    doc: BudgetDoc;
    created_at: string;
    updated_at: string;
  }[]) {
    next[r.id] = normalize({
      ...r.doc,
      id: r.id,
      yearId: r.fiscal_year_id,
      gianId: r.gian_id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  cache = next;
  hydrated = true;
  notify();
}

export function getStore(): BudgetStore {
  return cache;
}
export function getStoreDefault(): BudgetStore {
  return EMPTY;
}
export function getBudget(id: string): BudgetDoc | undefined {
  return cache[id];
}
export function getBudgetDefault(): BudgetDoc | undefined {
  return undefined;
}

export function listBudgets(): BudgetDoc[] {
  return Object.values(cache).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}
export function listBudgetsForYear(yearId: string): BudgetDoc[] {
  return listBudgets().filter((b) => b.yearId === yearId);
}
export function budgetForGian(gianId: string): BudgetDoc | undefined {
  return Object.values(cache).find((b) => b.gianId === gianId);
}

// ── 永続化 ──
async function persist(id: string): Promise<void> {
  const d = cache[id];
  if (!d) return;
  const { error } = await db().from("budget_docs").upsert({
    id,
    fiscal_year_id: d.yearId,
    gian_id: d.gianId,
    title: d.title,
    doc: d,
    updated_at: d.updatedAt,
  });
  if (error) console.error("[budgetStore] 保存失敗:", error.message);
}

function set(id: string, d: BudgetDoc) {
  cache = { ...cache, [id]: d };
  notify();
}

// ── 変更操作 ──
export function createBudget(opts: {
  yearId: string;
  gianId?: string | null;
  title?: string;
}): string {
  const d = blankDoc(opts.yearId, opts.gianId ?? null, opts.title ?? "");
  set(d.id, d);
  void persist(d.id);
  return d.id;
}

export function saveBudget(id: string, doc: BudgetDoc): void {
  set(id, { ...doc, updatedAt: new Date().toISOString() });
  void persist(id);
}

export function deleteBudget(id: string): void {
  const doc = cache[id];
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  // 添付ファイル（見積書など）も片付ける
  if (doc) {
    const attachIds = [...doc.revenue, ...doc.expense]
      .flatMap((c) => c.items)
      .map((it) => it.attachmentId)
      .filter((v): v is string => !!v);
    for (const fid of attachIds) void deleteFileObj(fid);
  }
  void db().from("budget_docs").delete().eq("id", id);
}
