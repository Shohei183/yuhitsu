// ─────────────────────────────────────────────────────────────
// 基本方針の「従来様式」（印刷・Word出力用）のデータ
//
//  従来の Word 様式（サンプル/事務局基本方針vr1.docx）に合わせた、1枚の表の形。
//  画面の表示は変えず、印刷（PDF）と Word 出力だけがこの様式になる。
//   題名（中央）／右寄せの委員長
//   表：担当 | 配属メンバー ／ 基本方針の本文 ／ 事業計画の一覧 ／ 事業予定 ／ 委員会予算（収入・支出）
//  印刷用の画面部品（KihonLegacySheet）と Word 出力の両方が、このデータから作られる。
// ─────────────────────────────────────────────────────────────

import type { BudgetLine, Gian } from "./mockData";
import { getMember } from "./memberStore";
import { getYear } from "./yearStore";
import { jpNum, parseAmount, sumAmounts } from "./format";
import { sanitizeRichHtml } from "./richText";

/** 文字の一続き（赤文字かどうかだけ区別する） */
export interface LegacyRun {
  text: string;
  red?: boolean;
}
/** 1段落 */
export type LegacyPara = LegacyRun[];

export interface LegacyPerson {
  role: string;
  name: string;
}
export interface LegacyBudgetLine {
  label: string;
  /** 「34,000円」のように整えた金額（数字でなければ、入力そのまま） */
  amount: string;
}

export interface KihonLegacy {
  /** 題名（末尾の「について」は除く） */
  title: string;
  /** 右寄せの1行（例：事務局長　平野　智弘）。委員長が未登録なら空 */
  chair: string;
  leads: LegacyPerson[];
  members: LegacyPerson[];
  /** 基本方針の本文（段落ごと） */
  policy: LegacyPara[];
  /** 事業計画の一覧（例：1．総会の運営について） */
  plans: string[];
  /** 事業予定（例：1月　総会） */
  schedule: string[];
  income: LegacyBudgetLine[];
  expense: LegacyBudgetLine[];
  incomeTotal: string;
  expenseTotal: string;
}

// ── 委員長 ──
/**
 * 議案の委員会に「委員長」として登録されている人の、右上の1行。
 * 事務局は委員長の役職が「事務局長」なので、その場合は「事務局長」と出す。
 */
export function kihonChairLine(gian: Gian): string {
  if (!gian.yearId || !gian.committeeId) return "";
  const year = getYear(gian.yearId);
  if (!year) return "";
  const here = year.assignments.filter((a) => a.committeeId === gian.committeeId);
  const hit =
    here.find((a) => a.role === "committee_chair") ??
    here.find((a) => a.role === "secretary_general");
  if (!hit) return "";
  const name = getMember(hit.memberId)?.name?.trim();
  if (!name) return "";
  const role = hit.role === "secretary_general" ? "事務局長" : "委員長";
  return `${role}　${name}`;
}

// ── リッチテキスト → 段落 ──
function parasFromRich(html: string | null | undefined): LegacyPara[] {
  const safe = sanitizeRichHtml(html);
  if (!safe) return [];
  if (typeof document === "undefined") {
    return safe
      .split(/<br\s*\/?>/i)
      .map((line) => [{ text: line.replace(/<[^>]+>/g, "") }]);
  }
  const tpl = document.createElement("template");
  tpl.innerHTML = safe;
  const paras: LegacyPara[] = [[]];
  const walk = (node: Node, red: boolean) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = (n.textContent ?? "").replace(/ /g, " ");
        if (text) paras[paras.length - 1].push({ text, red: red || undefined });
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement;
        if (el.tagName === "BR") paras.push([]);
        else walk(el, red || !!el.style?.color);
      }
    });
  };
  walk(tpl.content, false);
  return paras;
}

function plainOf(html: string | null | undefined): string {
  return parasFromRich(html)
    .map((p) => p.map((r) => r.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function yen(n: number): string {
  return `${jpNum(n)}円`;
}
function lineOf(l: BudgetLine): LegacyBudgetLine {
  const raw = (l.amount ?? "").trim();
  return {
    label: l.label ?? "",
    amount: /\d/.test(raw) ? yen(parseAmount(raw)) : raw,
  };
}

/** 画面の基本方針のデータから、従来様式のデータを作る */
export function buildKihonLegacy(gian: Gian): KihonLegacy {
  const income = gian.committeeBudget?.income ?? [];
  const expense = gian.committeeBudget?.expense ?? [];
  return {
    title: (gian.topic ?? "").replace(/について\s*$/, "").trim(),
    chair: kihonChairLine(gian),
    leads: (gian.assignedLeads ?? [])
      .filter((p) => p.role.trim() || p.name.trim())
      .map((p) => ({ role: p.role.trim(), name: p.name.trim() })),
    members: (gian.assignedMembers ?? [])
      .filter((p) => p.role.trim() || p.name.trim())
      .map((p) => ({ role: p.role.trim(), name: p.name.trim() })),
    policy: gian.outline.flatMap((it) => parasFromRich(it.body)),
    plans: gian.overview.map((it) => `${it.no}．${(it.label ?? "").trim()}`),
    schedule: gian.implementationSchedule
      .map((e) => `${(e.date ?? "").trim()}　${plainOf(e.content)}`.trim())
      .filter(Boolean),
    income: income.map(lineOf),
    expense: expense.map(lineOf),
    incomeTotal: yen(sumAmounts(income)),
    expenseTotal: yen(sumAmounts(expense)),
  };
}

/**
 * 左の見出し欄（担当）に出す役職の行。
 * 見出しに「担当」と出すので、役職の先頭の「担当」は除き、
 * 「副理事長 兼 専務理事」は「副理事長」「兼 専務理事」の2行にする。
 */
export function splitRoleLines(role: string): string[] {
  return role
    .replace(/^担当\s*/, "")
    .split(/(?=兼)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
