"use client";

// ─────────────────────────────────────────────────────────────
// 議案・次第テンプレートのストア（年度ごと・本番: Supabase）
//
// year_templates(fiscal_year_id, data jsonb) に YearTemplate 丸ごとを保存。
// 行が無ければコード既定 defaultTemplate() を使う（編集して初めて行ができる）。
// ─────────────────────────────────────────────────────────────

import {
  GianKind,
  KIHON_OUTLINE_LABELS,
  KIHON_OVERVIEW_LABELS,
  OUTLINE_LABELS,
  OVERVIEW_LABELS,
} from "./mockData";
import { db } from "./backend/client";

export interface TemplateItem {
  id: string;
  label: string;
}

export type TemplateList =
  | "kyogiOutline"
  | "kyogiOverview"
  | "shingiOutline"
  | "shingiOverview"
  | "kessanKyogiOutline"
  | "kessanKyogiOverview"
  | "kessanShingiOutline"
  | "kessanShingiOverview"
  | "kihonOutline"
  | "kihonOverview"
  | "sidaiSections";

export const TEMPLATE_LIST_LABEL: Record<TemplateList, string> = {
  kyogiOutline: "事業要綱の項目",
  kyogiOverview: "事業概要の項目",
  shingiOutline: "事業要綱の項目",
  shingiOverview: "事業概要の項目",
  kessanKyogiOutline: "事業要綱の項目",
  kessanKyogiOverview: "事業概要の項目",
  kessanShingiOutline: "事業要綱の項目",
  kessanShingiOverview: "事業概要の項目",
  kihonOutline: "基本方針（本文）の項目",
  kihonOverview: "事業計画の項目",
  sidaiSections: "次第の区分",
};

export interface GianTemplate {
  outline: TemplateItem[];
  overview: TemplateItem[];
}

export interface YearTemplate {
  yearId: string;
  kyogi: GianTemplate;
  shingi: GianTemplate;
  kessanKyogi: GianTemplate;
  kessanShingi: GianTemplate;
  kihon: GianTemplate;
  sidaiSections: TemplateItem[];
  updatedAt: string;
}

export type TemplateStore = Record<string, YearTemplate>;

const SIDAI_SECTION_LABELS = ["開会", "役員報告", "協議事項", "審議事項", "報告・閉会"];

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function items(prefix: string, labels: string[]): TemplateItem[] {
  return labels.map((label, i) => ({ id: `${prefix}-${i + 1}`, label }));
}

function defaultTemplate(yearId: string): YearTemplate {
  return {
    yearId,
    kyogi: {
      outline: items(`tpl-${yearId}-ko`, OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-kv`, OVERVIEW_LABELS),
    },
    shingi: {
      outline: items(`tpl-${yearId}-so`, OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-sv`, OVERVIEW_LABELS),
    },
    kessanKyogi: {
      outline: items(`tpl-${yearId}-dko`, OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-dkv`, [...OVERVIEW_LABELS, "決算額・予算差異の説明"]),
    },
    kessanShingi: {
      outline: items(`tpl-${yearId}-dso`, OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-dsv`, [...OVERVIEW_LABELS, "決算額・予算差異の説明"]),
    },
    kihon: {
      outline: items(`tpl-${yearId}-ho`, KIHON_OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-hv`, KIHON_OVERVIEW_LABELS),
    },
    sidaiSections: items(`tpl-${yearId}-s`, SIDAI_SECTION_LABELS),
    updatedAt: "2025-08-01T00:00:00.000Z",
  };
}

function getList(t: YearTemplate, list: TemplateList): TemplateItem[] {
  switch (list) {
    case "kyogiOutline": return t.kyogi.outline;
    case "kyogiOverview": return t.kyogi.overview;
    case "shingiOutline": return t.shingi.outline;
    case "shingiOverview": return t.shingi.overview;
    case "kessanKyogiOutline": return t.kessanKyogi.outline;
    case "kessanKyogiOverview": return t.kessanKyogi.overview;
    case "kessanShingiOutline": return t.kessanShingi.outline;
    case "kessanShingiOverview": return t.kessanShingi.overview;
    case "kihonOutline": return t.kihon.outline;
    case "kihonOverview": return t.kihon.overview;
    case "sidaiSections": return t.sidaiSections;
  }
}

function withList(t: YearTemplate, list: TemplateList, arr: TemplateItem[]): YearTemplate {
  switch (list) {
    case "kyogiOutline": return { ...t, kyogi: { ...t.kyogi, outline: arr } };
    case "kyogiOverview": return { ...t, kyogi: { ...t.kyogi, overview: arr } };
    case "shingiOutline": return { ...t, shingi: { ...t.shingi, outline: arr } };
    case "shingiOverview": return { ...t, shingi: { ...t.shingi, overview: arr } };
    case "kessanKyogiOutline": return { ...t, kessanKyogi: { ...t.kessanKyogi, outline: arr } };
    case "kessanKyogiOverview": return { ...t, kessanKyogi: { ...t.kessanKyogi, overview: arr } };
    case "kessanShingiOutline": return { ...t, kessanShingi: { ...t.kessanShingi, outline: arr } };
    case "kessanShingiOverview": return { ...t, kessanShingi: { ...t.kessanShingi, overview: arr } };
    case "kihonOutline": return { ...t, kihon: { ...t.kihon, outline: arr } };
    case "kihonOverview": return { ...t, kihon: { ...t.kihon, overview: arr } };
    case "sidaiSections": return { ...t, sidaiSections: arr };
  }
}

// ── キャッシュ ──
let cache: TemplateStore = {};
const EMPTY: TemplateStore = {};
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function hydrate(): Promise<void> {
  const { data, error } = await db().from("year_templates").select("*");
  if (error) {
    console.error("[templateStore] hydrate 失敗:", error.message);
    return;
  }
  const next: TemplateStore = {};
  for (const r of (data ?? []) as { fiscal_year_id: string; data: YearTemplate }[]) {
    next[r.fiscal_year_id] = r.data;
  }
  cache = next;
  notify();
}

export function getStore(): TemplateStore {
  return cache;
}
export function getStoreDefault(): TemplateStore {
  return EMPTY;
}
export function getTemplate(yearId: string): YearTemplate {
  return cache[yearId] ?? defaultTemplate(yearId);
}
export function getTemplateDefault(yearId: string): YearTemplate {
  return defaultTemplate(yearId);
}

export function getGianTemplate(yearId: string, kind: GianKind): GianTemplate {
  const t = getTemplate(yearId);
  if (kind === "協議") return t.kyogi;
  if (kind === "決算協議") return t.kessanKyogi;
  if (kind === "決算審議") return t.kessanShingi;
  if (kind === "基本方針") return t.kihon;
  return t.shingi;
}

export function sectionLabels(yearId: string): string[] {
  return getTemplate(yearId).sidaiSections.map((s) => s.label);
}

export function isTemplateCustomized(yearId: string): boolean {
  const cur = cache[yearId];
  if (!cur) return false;
  const def = defaultTemplate(yearId);
  const same = (a: TemplateItem[], b: TemplateItem[]) =>
    a.length === b.length && a.every((x, i) => x.label === b[i]?.label);
  const lists: TemplateList[] = [
    "kyogiOutline", "kyogiOverview", "shingiOutline", "shingiOverview",
    "kessanKyogiOutline", "kessanKyogiOverview", "kessanShingiOutline",
    "kessanShingiOverview", "kihonOutline", "kihonOverview", "sidaiSections",
  ];
  return !lists.every((l) => same(getList(cur, l), getList(def, l)));
}

// ── 変更操作（楽観更新 ＋ Supabase upsert） ──

async function persist(yearId: string, t: YearTemplate) {
  await db()
    .from("year_templates")
    .upsert({ fiscal_year_id: yearId, data: t, updated_at: new Date().toISOString() });
}

function mutate(
  yearId: string,
  list: TemplateList,
  fn: (arr: TemplateItem[]) => TemplateItem[]
): void {
  const cur = cache[yearId] ?? defaultTemplate(yearId);
  const next: YearTemplate = {
    ...withList(cur, list, fn(getList(cur, list))),
    updatedAt: new Date().toISOString(),
  };
  cache = { ...cache, [yearId]: next };
  notify();
  void persist(yearId, next);
}

export function renameItem(yearId: string, list: TemplateList, itemId: string, label: string): void {
  mutate(yearId, list, (arr) => arr.map((it) => (it.id === itemId ? { ...it, label } : it)));
}
export function addItem(yearId: string, list: TemplateList): void {
  mutate(yearId, list, (arr) => [...arr, { id: newId("tpl"), label: "" }]);
}
export function removeItem(yearId: string, list: TemplateList, itemId: string): void {
  mutate(yearId, list, (arr) => arr.filter((it) => it.id !== itemId));
}
export function moveItem(yearId: string, list: TemplateList, itemId: string, dir: "up" | "down"): void {
  mutate(yearId, list, (arr) => {
    const i = arr.findIndex((it) => it.id === itemId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
}

export function resetTemplate(yearId: string): void {
  const next = { ...cache };
  delete next[yearId];
  cache = next;
  notify();
  void db().from("year_templates").delete().eq("fiscal_year_id", yearId);
}
