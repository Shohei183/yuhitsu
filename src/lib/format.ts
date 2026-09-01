// ─────────────────────────────────────────────────────────────
// 表示用の数値フォーマット
//
// 要件：すべての数字はカンマ区切りで表示する。ただし西暦（"2026年" など）は例外。
// ─────────────────────────────────────────────────────────────

/** 数値（または数値文字列）を 3 桁区切りにする。パースできなければそのまま返す */
export function jpNum(value: number | string): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US");
}

/** 金額文字列（"￥1,200,000-" など）から数値を取り出す。取れなければ 0 */
export function parseAmount(s: string): number {
  const digits = String(s).replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

/** 金額行の合計（数値） */
export function sumAmounts(lines: { amount: string }[]): number {
  return lines.reduce((acc, l) => acc + parseAmount(l.amount), 0);
}

/**
 * 全角数字（０-９）・全角コロン（：）・全角ピリオド（．）・全角スペースを
 * 半角へ変換する。時刻・日時の入力欄向け。
 */
export function toHalfWidth(s: string): string {
  return String(s)
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)
    )
    .replace(/：/g, ":")
    .replace(/．/g, ".")
    .replace(/　/g, " ");
}

/**
 * 本文テキスト中の数字を 3 桁区切りにする。
 * - 4 桁以上の連続数字が対象（3 桁以下はそのまま）
 * - 直後が「年」の場合は西暦とみなしてそのまま（例：2026年）
 * - すでにカンマや数字に隣接している箇所は対象外（"1,200,000" を壊さない）
 */
export function formatDocNumbers(text: string): string {
  if (!text) return text;
  return text.replace(/(?<![\d,.])\d{4,}(?![\d,])/g, (m, offset: number, full: string) => {
    const after = full.slice(offset + m.length, offset + m.length + 2);
    if (after.startsWith("年")) return m; // 西暦
    return Number(m).toLocaleString("en-US");
  });
}
