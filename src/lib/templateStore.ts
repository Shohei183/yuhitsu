// ─────────────────────────────────────────────────────────────
// 議案・次第テンプレートのストア（年度ごと）
//
// 要件定義書 3.5：大枠は標準テンプレート。各年度の権限保持者（配信データ作成者クラス）が
// 項目名の変更・追加・削除・並び替えをできる。項目名（表示ラベル）と項目ID は分離。
//
// テンプレートは議案 4 種類 ＋ 次第:
//  - 協議：協議議案の事業要綱／事業概要の項目（「前回までの流れ」あり）
//  - 審議：審議議案の項目（「前回までの流れ」なし）
//  - 決算協議：決算議案（協議）の項目（「前回までの流れ」あり）
//  - 決算審議：決算議案（審議）の項目（「前回までの流れ」なし）
//  - 次第：区分（見出し）の並び。新規次第作成時の初期構成に使う。
//
// プロトタイプ: localStorage のみ。/templates 画面で編集する。
// ─────────────────────────────────────────────────────────────

import {
  GianKind,
  KIHON_OUTLINE_LABELS,
  KIHON_OVERVIEW_LABELS,
  OUTLINE_LABELS,
  OVERVIEW_LABELS,
} from "./mockData";

const LS_KEY = "yuhitsu.templates.v5"; // v4→v5: 基本方針テンプレートを追加

/** テンプレートの 1 項目。label は編集可、id は不変（複製時のデータ引き継ぎ用） */
export interface TemplateItem {
  id: string;
  label: string;
}

/** 編集対象のリスト種別（フラットなキー） */
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
  /** 協議議案 */
  kyogi: GianTemplate;
  /** 審議議案 */
  shingi: GianTemplate;
  /** 決算議案（協議）*/
  kessanKyogi: GianTemplate;
  /** 決算議案（審議）*/
  kessanShingi: GianTemplate;
  /** 基本方針（事務局事業計画など）。outline=基本方針本文／overview=事業計画 */
  kihon: GianTemplate;
  /** 次第の区分 */
  sidaiSections: TemplateItem[];
  updatedAt: string;
}

export type TemplateStore = Record<string, YearTemplate>;

const KNOWN_YEARS = ["fy-2026", "fy-2027", "fy-2028"];

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
      overview: items(`tpl-${yearId}-dkv`, [
        ...OVERVIEW_LABELS,
        "決算額・予算差異の説明",
      ]),
    },
    kessanShingi: {
      outline: items(`tpl-${yearId}-dso`, OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-dsv`, [
        ...OVERVIEW_LABELS,
        "決算額・予算差異の説明",
      ]),
    },
    kihon: {
      outline: items(`tpl-${yearId}-ho`, KIHON_OUTLINE_LABELS),
      overview: items(`tpl-${yearId}-hv`, KIHON_OVERVIEW_LABELS),
    },
    sidaiSections: items(`tpl-${yearId}-s`, SIDAI_SECTION_LABELS),
    updatedAt: "2025-08-01T00:00:00.000Z",
  };
}

function buildDefaults(): TemplateStore {
  const store: TemplateStore = {};
  for (const y of KNOWN_YEARS) store[y] = defaultTemplate(y);
  return store;
}

// ── リストの読み書き（フラットキー → ネスト構造） ──
function getList(t: YearTemplate, list: TemplateList): TemplateItem[] {
  switch (list) {
    case "kyogiOutline":
      return t.kyogi.outline;
    case "kyogiOverview":
      return t.kyogi.overview;
    case "shingiOutline":
      return t.shingi.outline;
    case "shingiOverview":
      return t.shingi.overview;
    case "kessanKyogiOutline":
      return t.kessanKyogi.outline;
    case "kessanKyogiOverview":
      return t.kessanKyogi.overview;
    case "kessanShingiOutline":
      return t.kessanShingi.outline;
    case "kessanShingiOverview":
      return t.kessanShingi.overview;
    case "kihonOutline":
      return t.kihon.outline;
    case "kihonOverview":
      return t.kihon.overview;
    case "sidaiSections":
      return t.sidaiSections;
  }
}

function withList(
  t: YearTemplate,
  list: TemplateList,
  arr: TemplateItem[]
): YearTemplate {
  switch (list) {
    case "kyogiOutline":
      return { ...t, kyogi: { ...t.kyogi, outline: arr } };
    case "kyogiOverview":
      return { ...t, kyogi: { ...t.kyogi, overview: arr } };
    case "shingiOutline":
      return { ...t, shingi: { ...t.shingi, outline: arr } };
    case "shingiOverview":
      return { ...t, shingi: { ...t.shingi, overview: arr } };
    case "kessanKyogiOutline":
      return { ...t, kessanKyogi: { ...t.kessanKyogi, outline: arr } };
    case "kessanKyogiOverview":
      return { ...t, kessanKyogi: { ...t.kessanKyogi, overview: arr } };
    case "kessanShingiOutline":
      return { ...t, kessanShingi: { ...t.kessanShingi, outline: arr } };
    case "kessanShingiOverview":
      return { ...t, kessanShingi: { ...t.kessanShingi, overview: arr } };
    case "kihonOutline":
      return { ...t, kihon: { ...t.kihon, outline: arr } };
    case "kihonOverview":
      return { ...t, kihon: { ...t.kihon, overview: arr } };
    case "sidaiSections":
      return { ...t, sidaiSections: arr };
  }
}

// ── キャッシュ ──
let cache: TemplateStore | null = null;
let defaultsCache: TemplateStore | null = null;

function loadDefaults(): TemplateStore {
  if (!defaultsCache) defaultsCache = buildDefaults();
  return defaultsCache;
}

function load(): TemplateStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = loadDefaults();
    return cache;
  }
  const base = buildDefaults();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cache = { ...base, ...(JSON.parse(raw) as TemplateStore) };
      return cache;
    }
  } catch {
    /* 破損時は初期状態 */
  }
  cache = base;
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: TemplateStore): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStore(): TemplateStore {
  return load();
}
export function getStoreDefault(): TemplateStore {
  return loadDefaults();
}
export function getTemplate(yearId: string): YearTemplate {
  return load()[yearId] ?? defaultTemplate(yearId);
}
export function getTemplateDefault(yearId: string): YearTemplate {
  return loadDefaults()[yearId] ?? defaultTemplate(yearId);
}

/** その議案種別（協議／審議／決算協議／決算審議）で使う議案テンプレート */
export function getGianTemplate(
  yearId: string,
  kind: GianKind
): GianTemplate {
  const t = getTemplate(yearId);
  if (kind === "協議") return t.kyogi;
  if (kind === "決算協議") return t.kessanKyogi;
  if (kind === "決算審議") return t.kessanShingi;
  if (kind === "基本方針") return t.kihon;
  return t.shingi;
}

/** 次第の区分ラベルだけ取り出す（次第作成で使用） */
export function sectionLabels(yearId: string): string[] {
  return getTemplate(yearId).sidaiSections.map((s) => s.label);
}

/** その年度のテンプレートが既定から変更されているか */
export function isTemplateCustomized(yearId: string): boolean {
  const cur = load()[yearId];
  if (!cur) return false;
  const def = defaultTemplate(yearId);
  const same = (a: TemplateItem[], b: TemplateItem[]) =>
    a.length === b.length && a.every((x, i) => x.label === b[i]?.label);
  const lists: TemplateList[] = [
    "kyogiOutline",
    "kyogiOverview",
    "shingiOutline",
    "shingiOverview",
    "kessanKyogiOutline",
    "kessanKyogiOverview",
    "kessanShingiOutline",
    "kessanShingiOverview",
    "kihonOutline",
    "kihonOverview",
    "sidaiSections",
  ];
  return !lists.every((l) => same(getList(cur, l), getList(def, l)));
}

// ── 変更操作（配信データ作成者クラスが呼ぶ想定。権限チェックは画面側）──

function mutate(
  yearId: string,
  list: TemplateList,
  fn: (arr: TemplateItem[]) => TemplateItem[]
): void {
  const store = load();
  const cur = store[yearId] ?? defaultTemplate(yearId);
  const next: YearTemplate = {
    ...withList(cur, list, fn(getList(cur, list))),
    updatedAt: new Date().toISOString(),
  };
  commit({ ...store, [yearId]: next });
}

export function renameItem(
  yearId: string,
  list: TemplateList,
  itemId: string,
  label: string
): void {
  mutate(yearId, list, (arr) =>
    arr.map((it) => (it.id === itemId ? { ...it, label } : it))
  );
}

export function addItem(yearId: string, list: TemplateList): void {
  mutate(yearId, list, (arr) => [...arr, { id: newId("tpl"), label: "" }]);
}

export function removeItem(
  yearId: string,
  list: TemplateList,
  itemId: string
): void {
  mutate(yearId, list, (arr) => arr.filter((it) => it.id !== itemId));
}

export function moveItem(
  yearId: string,
  list: TemplateList,
  itemId: string,
  dir: "up" | "down"
): void {
  mutate(yearId, list, (arr) => {
    const i = arr.findIndex((it) => it.id === itemId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
}

/** その年度のテンプレートを既定に戻す */
export function resetTemplate(yearId: string): void {
  const store = { ...load() };
  store[yearId] = defaultTemplate(yearId);
  commit(store);
}

/** 動作確認用：全テンプレートを既定へ */
export function resetTemplateStore(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
  cache = null;
  commit(buildDefaults());
}
