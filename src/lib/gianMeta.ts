import { Gian } from "./mockData";
import { formatJaDate } from "./format";

/**
 * 同じ名前の議案を見分けるための補足情報（上程先の会議・作成日・上程日）。
 * 例：「第1回予定者理事会 ／ 作成 2026年09月04日 ／ 上程 2026年09月07日」
 */
export function gianMetaLine(g: Gian): string {
  const parts: string[] = [];
  if (g.submissionMeeting?.trim()) parts.push(g.submissionMeeting.trim());
  if (g.createdAt?.trim()) parts.push(`作成 ${g.createdAt.trim()}`);
  if (g.submittedAt) {
    const d = formatJaDate(g.submittedAt);
    if (d) parts.push(`上程 ${d}`);
  }
  return parts.join(" ／ ");
}
