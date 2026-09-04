import { Role, ROLE_LABEL } from "./yearStore";

// 役職ラベル → Role。表記ゆれを吸収する。
const ROLE_ALIASES: Record<string, Role> = {
  理事長: "president",
  直前理事長: "past_president",
  専務: "executive_director",
  専務理事: "executive_director",
  副理事長: "vice_president",
  監事: "auditor",
  事務局長: "secretary_general",
  委員長: "committee_chair",
  委員: "committee_member",
  委員会メンバー: "committee_member",
  メンバー: "committee_member",
  理事: "director",
};

export function roleFromLabel(s: string): Role | null {
  const t = s.trim();
  if (!t) return null;
  if (ROLE_ALIASES[t]) return ROLE_ALIASES[t];
  for (const [k, v] of Object.entries(ROLE_LABEL)) {
    if (v === t) return k as Role;
  }
  return null;
}

export interface ParsedMemberRow {
  line: number;
  name: string;
  roleLabel: string;
  email: string;
  role: Role | null;
  isMasterLabel: boolean; // 役職欄が「マスター」＝ロール割当はしない（属性は別途付与）
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        q = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      q = true;
    } else if (c === "," || c === "\t") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeHeader(cells: string[]): boolean {
  const j = cells.join(",").toLowerCase();
  return /名前|氏名|name/.test(j) && /メール|アドレス|mail/.test(j);
}

/**
 * CSV/TSV テキストをパース。列は「名前, 役職, メール」の順を想定。
 * 先頭行がヘッダーらしければスキップ。役職は空でも可（招待のみ）。
 */
export function parseMembersCsv(text: string): ParsedMemberRow[] {
  const rawLines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (rawLines.length === 0) return [];

  let start = 0;
  if (looksLikeHeader(splitCsvLine(rawLines[0]))) start = 1;

  const rows: ParsedMemberRow[] = [];
  const seen = new Set<string>();

  for (let i = start; i < rawLines.length; i++) {
    const cells = splitCsvLine(rawLines[i]);
    const name = cells[0] ?? "";
    const roleLabel = cells[1] ?? "";
    const email = (cells[2] ?? "").toLowerCase();

    const errors: string[] = [];
    if (!name) errors.push("名前が空です");
    if (!email) errors.push("メールが空です");
    else if (!EMAIL_RE.test(email)) errors.push("メール形式が正しくありません");
    else if (seen.has(email)) errors.push("このCSV内でメールが重複しています");
    if (email) seen.add(email);

    const isMasterLabel = roleLabel.trim() === "マスター";
    const role = isMasterLabel ? null : roleFromLabel(roleLabel);
    if (roleLabel.trim() && !isMasterLabel && !role) {
      errors.push(`役職「${roleLabel}」を認識できません`);
    }

    rows.push({
      line: i + 1,
      name,
      roleLabel,
      email,
      role,
      isMasterLabel,
      errors,
    });
  }
  return rows;
}

/** File を UTF-8 で、ダメなら Shift_JIS で読む（Excel 日本語 CSV 対策） */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("shift_jis").decode(buf);
  } catch {
    return utf8;
  }
}
