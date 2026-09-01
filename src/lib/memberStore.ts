// ─────────────────────────────────────────────────────────────
// メンバー管理ストア（LOM 全体で 1 つ・年度に依存しない）
//
// 要件定義書 3.8 / 3.12：
//  - アカウント発行はここから（年度非依存）。マスターが発行・退会を行う。
//  - 年度ごとのロールは yearStore（メンバー権限）側で割り当てる。
//
// プロトタイプ: localStorage のみ。パスワードは平文ダミー（実運用ではハッシュ化）。
// ─────────────────────────────────────────────────────────────

import { MEMBERS } from "./mockData";

const LS_KEY = "yuhitsu.members.v1";

/** プロトタイプ用の共通ダミーパスワード（ログイン画面にヒント表示） */
export const DEMO_PASSWORD = "jc";

export type MemberStatus = "active" | "retired";

export interface Member {
  id: string;
  name: string;
  email: string;
  /** プロトタイプ用の平文ダミー */
  password: string;
  status: MemberStatus;
  /** LOM 全体の管理者（メンバー管理・年度作成にアクセスできる） */
  isMaster: boolean;
  issuedAt: string;
}

export type MemberStore = Record<string, Member>;

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** 氏名 → ローマ字メールのローカル部（ダミー生成用の簡易対応表） */
const EMAIL_LOCAL: Record<string, string> = {
  "梅澤 侑未": "umezawa",
  "加藤 一樹": "kato",
  "水落 太貴": "mizuochi",
  "佐藤 拓真": "sato",
  "丹羽 智子": "niwa",
  "丸川 翼": "marukawa",
  "名和 俊": "nawa",
  "筒井 健太郎": "tsutsui",
  "山田 由紀": "yamada",
  "鈴木 花子": "suzuki",
  "高橋 誠": "takahashi",
  "貝沼 大輔": "kainuma",
  "石川 直樹": "ishikawa",
  "森田 彩": "morita",
};

const EMAIL_DOMAIN = "komaki-jc.example";

function emailFor(name: string, index: number): string {
  const local = EMAIL_LOCAL[name] ?? `member${index + 1}`;
  return `${local}@${EMAIL_DOMAIN}`;
}

/** メンバー ID は氏名から安定生成（yearStore の割当が氏名参照でも揺れないように） */
export function memberIdForName(name: string): string {
  const local = EMAIL_LOCAL[name];
  return local ? `mbr-${local}` : `mbr-${name}`;
}

function buildDefaults(): MemberStore {
  const store: MemberStore = {};
  const master: Member = {
    id: "mbr-master",
    name: "システム管理者",
    email: `master@${EMAIL_DOMAIN}`,
    password: DEMO_PASSWORD,
    status: "active",
    isMaster: true,
    issuedAt: "2025-08-01T00:00:00.000Z",
  };
  store[master.id] = master;

  MEMBERS.forEach((name, i) => {
    const m: Member = {
      id: memberIdForName(name),
      name,
      email: emailFor(name, i),
      password: DEMO_PASSWORD,
      status: "active",
      isMaster: false,
      issuedAt: "2025-08-10T00:00:00.000Z",
    };
    store[m.id] = m;
  });

  return store;
}

// ── キャッシュ ──
let cache: MemberStore | null = null;
let defaultsCache: MemberStore | null = null;

function loadDefaults(): MemberStore {
  if (!defaultsCache) defaultsCache = buildDefaults();
  return defaultsCache;
}

function load(): MemberStore {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = loadDefaults();
    return cache;
  }
  const base = buildDefaults();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cache = { ...base, ...(JSON.parse(raw) as MemberStore) };
      return cache;
    }
  } catch {
    /* 破損時は初期状態 */
  }
  cache = base;
  return cache;
}

const listeners = new Set<() => void>();

function commit(next: MemberStore): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* 容量超過等は無視 */
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

export function getStore(): MemberStore {
  return load();
}
export function getStoreDefault(): MemberStore {
  return loadDefaults();
}
export function getMember(id: string): Member | undefined {
  return load()[id];
}
export function getMemberDefault(id: string): Member | undefined {
  return loadDefaults()[id];
}

export function getMemberByEmail(email: string): Member | undefined {
  const q = email.trim().toLowerCase();
  return Object.values(load()).find((m) => m.email.toLowerCase() === q);
}

/** 発行日時 → 氏名順（マスターを先頭に） */
export function listMembers(): Member[] {
  return Object.values(load()).sort((a, b) => {
    if (a.isMaster !== b.isMaster) return a.isMaster ? -1 : 1;
    return a.name.localeCompare(b.name, "ja");
  });
}

// ── 変更操作（マスターのみが呼ぶ想定。権限チェックは画面側）──

export function issueAccount(input: {
  name: string;
  email: string;
}): Member | null {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name || !email) return null;
  if (getMemberByEmail(email)) return null; // 重複メールは発行しない

  const member: Member = {
    id: newId("mbr"),
    name,
    email,
    password: DEMO_PASSWORD,
    status: "active",
    isMaster: false,
    issuedAt: new Date().toISOString(),
  };
  commit({ ...load(), [member.id]: member });
  return member;
}

/** 氏名・メールアドレスの変更（マスターが編集。空欄は無視・メール重複は拒否） */
export function updateMember(
  id: string,
  patch: { name?: string; email?: string }
): boolean {
  const store = load();
  const m = store[id];
  if (!m) return false;
  const name = patch.name?.trim();
  const email = patch.email?.trim();
  if (email && email.toLowerCase() !== m.email.toLowerCase()) {
    const dup = getMemberByEmail(email);
    if (dup && dup.id !== id) return false;
  }
  commit({
    ...store,
    [id]: {
      ...m,
      name: name || m.name,
      email: email || m.email,
    },
  });
  return true;
}

export function setMemberStatus(id: string, status: MemberStatus): void {
  const store = load();
  const m = store[id];
  if (!m || m.isMaster) return; // マスターは退会させない
  commit({ ...store, [id]: { ...m, status } });
}

/** パスワード再設定（ダミー：トークン検証なし。authStore から呼ぶ） */
export function setPassword(id: string, password: string): void {
  const store = load();
  const m = store[id];
  if (!m || !password) return;
  commit({ ...store, [id]: { ...m, password } });
}

/** 動作確認用：ストアを初期状態へ */
export function resetMemberStore(): void {
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
