import { Gian } from "./mockData";
import { formatJaDate, formatJaDateTime } from "./format";

/**
 * 同じ名前の議案を見分けるための補足情報（上程先の会議・上程日・最終更新日時）。
 * 例：「第1回予定者理事会 ／ 上程 2026年09月07日 ／ 最終更新 2026年09月24日 13:20」
 */
export function gianMetaLine(g: Gian): string {
  const parts: string[] = [];
  if (g.submissionMeeting?.trim()) parts.push(g.submissionMeeting.trim());
  if (g.submittedAt) {
    const d = formatJaDate(g.submittedAt);
    if (d) parts.push(`上程 ${d}`);
  }
  if (g.updatedAt) {
    const d = formatJaDateTime(g.updatedAt);
    if (d) parts.push(`最終更新 ${d}`);
  } else if (g.createdAt?.trim()) {
    parts.push(`作成 ${g.createdAt.trim()}`);
  }
  return parts.join(" ／ ");
}

/** 議案の作成時刻（ms）。id に埋め込まれた採番時刻を使い、読めなければ作成日文字列から。 */
export function gianCreatedMs(g: Gian): number {
  const m = /^gian-([0-9a-z]+)-/.exec(g.id);
  if (m) {
    const t = parseInt(m[1], 36);
    if (Number.isFinite(t) && t > 1e12) return t;
  }
  const d = (g.createdAt ?? "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return d ? new Date(+d[1], +d[2] - 1, +d[3]).getTime() : 0;
}
