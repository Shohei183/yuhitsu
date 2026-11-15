"use client";

// ─────────────────────────────────────────────────────────────
// Word（.docx）出力
//
//  画面に表示している文書（議案・予算書など）を、本物の Word 文書（.docx）にして保存する。
//  1) 表示中の DOM を複製して整え（ボタン・入力欄を文字に）、画面外に置いて計算済みスタイルを読む
//  2) 見出し・段落・箇条書き・表（結合セルを含む）・太字・文字色を、Word の部品に変換する
//  変換は「画面の見た目に近い、編集しやすい Word 文書」を目標にしている
//  （CSS の細かな装飾までは再現しない）。
// ─────────────────────────────────────────────────────────────

import { downloadBlob, prepareExportClone, sanitizeFilename } from "./download";

// ── ページ設定（A4 縦・左右約12mm・上下約14mm。単位は twip＝1/20pt） ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_X = 680;
const MARGIN_Y = 794;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const FONT = "游ゴシック";
/** 画面の本文色（これと同じ色は指定しない＝Word の既定色） */
const DEFAULT_TEXT = new Set(["1B2430", "1A2230"]);

// ── 中間表現（DOM と docx の間） ──
interface IRRun {
  text?: string;
  br?: boolean;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
  /** half-point */
  size?: number;
}
interface IRBorder {
  color: string;
  /** 1/8 pt */
  size: number;
}
interface IRPara {
  kind: "p";
  runs: IRRun[];
  indent: number;
  before: number;
  after: number;
  align: "left" | "center" | "right";
  line: number;
  heading?: 1 | 2 | 3;
  pageBreak?: boolean;
  borderLeft?: IRBorder;
  borderBottom?: IRBorder;
}
interface IRCell {
  blocks: IRBlock[];
  colSpan: number;
  rowSpan: number;
  bg?: string;
  header: boolean;
}
interface IRTable {
  kind: "t";
  rows: IRCell[][];
  colWidths: number[];
}
type IRBlock = IRPara | IRTable;

// ── 計算済みスタイルの読み取り ──
function px(v: string | null | undefined): number {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
}
function toHex(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  const m = c.match(
    /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/
  );
  if (!m) return undefined;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined;
  return [m[1], m[2], m[3]]
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
const WS = /[ \t\r\n\f]+/g;

function runStyleOf(el: Element): Omit<IRRun, "text" | "br"> {
  const cs = getComputedStyle(el);
  const w = parseInt(cs.fontWeight, 10);
  const bold = cs.fontWeight === "bold" || (Number.isFinite(w) && w >= 600);
  let color = toHex(cs.color);
  if (color && DEFAULT_TEXT.has(color)) color = undefined;
  const size = Math.max(14, Math.min(72, Math.round(px(cs.fontSize) * 1.5)));
  return {
    bold: bold || undefined,
    italics: cs.fontStyle === "italic" || undefined,
    underline: cs.textDecorationLine.includes("underline") || undefined,
    color,
    size,
  };
}

function isHidden(el: Element, cs: CSSStyleDeclaration): boolean {
  return cs.display === "none" || cs.visibility === "hidden";
}
function isInline(cs: CSSStyleDeclaration): boolean {
  return cs.display.startsWith("inline") || cs.display === "contents";
}

// ── インライン（文字）の収集 ──
function addText(node: Text, runs: IRRun[]): void {
  const parent = node.parentElement;
  if (!parent) return;
  const raw = node.nodeValue ?? "";
  if (!raw) return;
  const style = runStyleOf(parent);
  const pre = getComputedStyle(parent).whiteSpace.startsWith("pre");
  if (pre) {
    const lines = raw.replace(/\r\n?/g, "\n").split("\n");
    lines.forEach((line, i) => {
      if (i > 0) runs.push({ br: true });
      if (line) runs.push({ ...style, text: line });
    });
    return;
  }
  const text = raw.replace(WS, " ");
  if (text) runs.push({ ...style, text });
}

function addInline(el: Element, runs: IRRun[]): void {
  const cs = getComputedStyle(el);
  if (isHidden(el, cs)) return;
  if (el.tagName === "BR") {
    runs.push({ br: true });
    return;
  }
  if (el.tagName === "IMG") return;
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) addText(n as Text, runs);
    else if (n.nodeType === Node.ELEMENT_NODE) addInline(n as Element, runs);
  });
}

/** 段落の先頭・末尾の空白を落とし、中身が無ければ null */
function cleanRuns(runs: IRRun[]): IRRun[] | null {
  const out = runs.map((r) => ({ ...r }));
  // 先頭
  for (const r of out) {
    if (r.br) break;
    if (r.text !== undefined) {
      r.text = r.text.replace(/^ +/, "");
      if (r.text !== "") break;
    }
  }
  // 末尾
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i];
    if (r.br) continue;
    if (r.text !== undefined) {
      r.text = r.text.replace(/ +$/, "");
      if (r.text !== "") break;
    }
  }
  // 先頭・末尾の改行は落とす
  while (out.length && (out[0].br || out[0].text === "")) out.shift();
  while (out.length && (out[out.length - 1].br || out[out.length - 1].text === ""))
    out.pop();
  const hasText = out.some((r) => r.text !== undefined && r.text.trim() !== "");
  return hasText ? out : null;
}

// ── ブロックの変換 ──
function paraProps(el: Element): Pick<IRPara, "align" | "line"> {
  const cs = getComputedStyle(el);
  const ta = cs.textAlign;
  const align: IRPara["align"] =
    ta === "center" ? "center" : ta === "right" || ta === "end" ? "right" : "left";
  const fs = px(cs.fontSize) || 14;
  const lh = px(cs.lineHeight);
  const ratio = lh > 0 ? Math.min(Math.max(lh / fs, 1.1), 1.6) : 1.4;
  return { align, line: Math.round(240 * ratio) };
}

function blocksOf(parent: Element, indent: number, availW: number): IRBlock[] {
  const out: IRBlock[] = [];
  let runs: IRRun[] = [];
  const flush = () => {
    const cleaned = cleanRuns(runs);
    runs = [];
    if (!cleaned) return;
    out.push({
      kind: "p",
      runs: cleaned,
      indent,
      before: 0,
      after: 0,
      ...paraProps(parent),
    });
  };
  parent.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      addText(n as Text, runs);
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const cs = getComputedStyle(el);
    if (isHidden(el, cs)) return;
    if (isInline(cs) && el.tagName !== "TABLE") {
      addInline(el, runs);
      return;
    }
    flush();
    out.push(...blockOf(el, cs, indent, availW));
  });
  flush();
  return out;
}

const CAP = 400;
function twipsOf(pxv: string): number {
  return Math.max(0, Math.min(CAP, Math.round(px(pxv) * 15)));
}
function borderOf(
  width: string,
  style: string,
  color: string
): IRBorder | undefined {
  if (px(width) <= 0 || style === "none" || style === "hidden") return undefined;
  const c = toHex(color);
  if (!c) return undefined;
  return { color: c, size: Math.max(4, Math.min(24, Math.round(px(width) * 6))) };
}

function blockOf(
  el: Element,
  cs: CSSStyleDeclaration,
  indent: number,
  availW: number
): IRBlock[] {
  const tag = el.tagName;
  if (tag === "TABLE") return [tableOf(el as HTMLTableElement, availW), spacer()];
  if (tag === "IMG" || tag === "HR" || tag === "SCRIPT" || tag === "STYLE") return [];

  const inc = Math.round((px(cs.marginLeft) + px(cs.paddingLeft)) * 15);
  const left = indent + inc;
  const innerW = availW - inc; // この要素の内側で使える幅

  let blocks: IRBlock[];
  if (tag === "UL" || tag === "OL") {
    blocks = listOf(el, cs, left, innerW);
  } else if (
    el.children.length > 0 &&
    Array.from(el.children).every((c) => c.tagName === "DT" || c.tagName === "DD")
  ) {
    // 「項目名　値」の1行（文書作成者　○○ など）
    const runs: IRRun[] = [];
    Array.from(el.children).forEach((c, i) => {
      if (i > 0) runs.push({ text: "　" });
      const sub: IRRun[] = [];
      addInline(c, sub);
      const cleaned = cleanRuns(sub);
      if (cleaned) {
        if (c.tagName === "DT") cleaned.forEach((r) => (r.bold = true));
        runs.push(...cleaned);
      }
    });
    blocks = runs.length
      ? [{ kind: "p", runs, indent: left, before: 0, after: 0, ...paraProps(el) }]
      : [];
  } else {
    blocks = blocksOf(el, left, innerW);
  }
  if (blocks.length === 0) return blocks;

  const first = blocks[0];
  const last = blocks[blocks.length - 1];

  // 見出し
  const hm = /^H([1-3])$/.exec(tag);
  if (hm) {
    for (const b of blocks)
      if (b.kind === "p") b.heading = Number(hm[1]) as 1 | 2 | 3;
  }
  // 要素の上下の余白
  if (first.kind === "p") first.before = Math.max(first.before, twipsOf(cs.marginTop));
  if (last.kind === "p") last.after = Math.max(last.after, twipsOf(cs.marginBottom));
  // 罫線（見出しの下線・左の色帯）
  if (last.kind === "p") {
    const b = borderOf(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor);
    if (b) last.borderBottom = b;
  }
  if (first.kind === "p") {
    const b = borderOf(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor);
    if (b) first.borderLeft = b;
  }
  // 配信データ内の予算書などは、新しいページから
  if (el.hasAttribute("data-export-gian")) {
    if (first.kind === "p") first.pageBreak = true;
    else
      blocks.unshift({
        kind: "p",
        runs: [{ text: "" }],
        indent: 0,
        before: 0,
        after: 0,
        align: "left",
        line: 240,
        pageBreak: true,
      });
  }
  return blocks;
}

function spacer(): IRPara {
  return {
    kind: "p",
    runs: [{ text: "", size: 8 }],
    indent: 0,
    before: 0,
    after: 60,
    align: "left",
    line: 240,
  };
}

function listOf(
  list: Element,
  cs: CSSStyleDeclaration,
  indent: number,
  availW: number
): IRBlock[] {
  const out: IRBlock[] = [];
  const type = cs.listStyleType;
  let n = 0;
  Array.from(list.children).forEach((li) => {
    const lcs = getComputedStyle(li);
    if (isHidden(li, lcs)) return;
    n++;
    const marker =
      type === "none" || li.tagName !== "LI"
        ? ""
        : list.tagName === "OL"
          ? `${n}. `
          : "・";
    const blocks = blockOfLi(li, lcs, indent, availW);
    if (marker) {
      const first = blocks.find((b) => b.kind === "p") as IRPara | undefined;
      if (first) first.runs.unshift({ text: marker });
    }
    out.push(...blocks);
  });
  return out;
}

function blockOfLi(
  li: Element,
  cs: CSSStyleDeclaration,
  indent: number,
  availW: number
): IRBlock[] {
  const blocks = blocksOf(li, indent, availW);
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (first && first.kind === "p") first.before = Math.max(first.before, twipsOf(cs.marginTop));
  if (last && last.kind === "p") last.after = Math.max(last.after, twipsOf(cs.marginBottom));
  return blocks;
}

// ── 表 ──
function tableOf(table: HTMLTableElement, availW: number): IRTable {
  availW = Math.max(2400, availW);
  const rows: IRCell[][] = [];
  const trs = Array.from(table.rows);
  let ncols = 0;
  trs.forEach((tr) => {
    let n = 0;
    Array.from(tr.cells).forEach((c) => (n += Math.max(1, c.colSpan)));
    ncols = Math.max(ncols, n);
  });
  ncols = Math.max(1, ncols);

  // 列の幅：結合のない行の実際の幅の比率に合わせる（無ければ均等）
  const plain = trs.find(
    (tr) =>
      tr.cells.length === ncols &&
      Array.from(tr.cells).every((c) => c.colSpan <= 1)
  );
  let ratios: number[] = Array(ncols).fill(1);
  if (plain) {
    const ws = Array.from(plain.cells).map((c) => c.getBoundingClientRect().width);
    if (ws.every((w) => w > 0)) ratios = ws;
  }
  const sum = ratios.reduce((a, b) => a + b, 0);
  const colWidths = ratios.map((r) => Math.max(500, Math.round((r / sum) * availW)));

  trs.forEach((tr) => {
    const cells: IRCell[] = [];
    Array.from(tr.cells).forEach((cell) => {
      const cs = getComputedStyle(cell);
      let bg = toHex(cs.backgroundColor);
      if (bg === "FFFFFF") bg = undefined;
      // セルの中身の最大幅（入れ子の表のため）
      const span = Math.max(1, cell.colSpan);
      const idx = cells.reduce((a, c) => a + c.colSpan, 0);
      const cellW = colWidths.slice(idx, idx + span).reduce((a, b) => a + b, 0);
      let blocks = blocksOf(cell, 0, Math.max(800, cellW - 200));
      // セルの文字の位置（右寄せの金額など）は blocksOf が段落ごとに拾う
      if (blocks.length === 0) blocks = [spacer()];
      // 先頭の余白はセル内では不要
      const f = blocks[0];
      if (f.kind === "p") f.before = 0;
      const l = blocks[blocks.length - 1];
      if (l.kind === "p") l.after = 0;
      cells.push({
        blocks,
        colSpan: span,
        rowSpan: Math.max(1, cell.rowSpan),
        bg,
        header: cell.tagName === "TH",
      });
    });
    if (cells.length) rows.push(cells);
  });
  return { kind: "t", rows, colWidths };
}

// ── docx の組み立て ──
type Docx = typeof import("docx");

function buildBlocks(D: Docx, blocks: IRBlock[]): (import("docx").Paragraph | import("docx").Table)[] {
  const out: (import("docx").Paragraph | import("docx").Table)[] = [];
  for (const b of blocks) {
    if (b.kind === "p") out.push(buildPara(D, b));
    else out.push(buildTable(D, b));
  }
  return out;
}

function buildPara(D: Docx, p: IRPara) {
  const children = p.runs.map((r) =>
    r.br
      ? new D.TextRun({ break: 1 })
      : new D.TextRun({
          text: r.text ?? "",
          bold: r.bold,
          italics: r.italics,
          underline: r.underline ? {} : undefined,
          color: r.color,
          size: r.size,
        })
  );
  const heading =
    p.heading === 1
      ? D.HeadingLevel.HEADING_1
      : p.heading === 2
        ? D.HeadingLevel.HEADING_2
        : p.heading === 3
          ? D.HeadingLevel.HEADING_3
          : undefined;
  const border: Record<string, unknown> = {};
  if (p.borderBottom)
    border.bottom = {
      style: D.BorderStyle.SINGLE,
      size: p.borderBottom.size,
      color: p.borderBottom.color,
      space: 2,
    };
  if (p.borderLeft)
    border.left = {
      style: D.BorderStyle.SINGLE,
      size: p.borderLeft.size,
      color: p.borderLeft.color,
      space: 6,
    };
  return new D.Paragraph({
    children,
    heading,
    alignment:
      p.align === "center"
        ? D.AlignmentType.CENTER
        : p.align === "right"
          ? D.AlignmentType.RIGHT
          : D.AlignmentType.LEFT,
    spacing: {
      before: p.before,
      after: p.after,
      line: p.line,
      lineRule: D.LineRuleType.AUTO,
    },
    indent: p.indent > 0 ? { left: p.indent } : undefined,
    pageBreakBefore: p.pageBreak || undefined,
    border: Object.keys(border).length ? (border as never) : undefined,
  });
}

function buildTable(D: Docx, t: IRTable) {
  const total = t.colWidths.reduce((a, b) => a + b, 0);
  const line = { style: D.BorderStyle.SINGLE, size: 4, color: "BFC6D4" };
  const borders = { top: line, bottom: line, left: line, right: line };
  const rows = t.rows.map((cells, ri) => {
    let col = 0;
    const isHeaderRow = cells.every((c) => c.header);
    const built = cells.map((c) => {
      const width = t.colWidths
        .slice(col, col + c.colSpan)
        .reduce((a, b) => a + b, 0);
      col += c.colSpan;
      let children = buildBlocks(D, c.blocks);
      if (children.length === 0) children = [new D.Paragraph({})];
      // 見出しセルは、太字にして薄い背景
      return new D.TableCell({
        children,
        width: { size: width, type: D.WidthType.DXA },
        columnSpan: c.colSpan > 1 ? c.colSpan : undefined,
        rowSpan: c.rowSpan > 1 ? c.rowSpan : undefined,
        shading: c.bg
          ? { type: D.ShadingType.CLEAR, fill: c.bg, color: "auto" }
          : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        verticalAlign: D.VerticalAlign.TOP,
        borders,
      });
    });
    return new D.TableRow({
      children: built,
      tableHeader: isHeaderRow && ri === 0 ? true : undefined,
      cantSplit: true,
    });
  });
  return new D.Table({
    width: { size: total, type: D.WidthType.DXA },
    columnWidths: t.colWidths,
    layout: D.TableLayoutType.FIXED,
    rows,
  });
}

/** 画面外に置いた複製から中間表現を作る（画面の CSS をそのまま使うため、DOM に置く必要がある） */
export function domToBlocks(root: Element): IRBlock[] {
  const cs = getComputedStyle(root);
  return blockOf(root, cs, 0, CONTENT_W);
}

export async function buildDocxBlob(
  root: Element,
  title: string
): Promise<Blob> {
  const D = await import("docx");
  const blocks = domToBlocks(root);
  const doc = new D.Document({
    creator: "ユーヒツ",
    title,
    styles: {
      paragraphStyles: [1, 2, 3].map((n) => ({
        id: `Heading${n}`,
        name: `heading ${n}`,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          font: { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT },
          bold: true,
          color: "1B2430",
        },
      })),
      default: {
        document: {
          run: {
            font: {
              ascii: FONT,
              hAnsi: FONT,
              eastAsia: FONT,
              cs: FONT,
            },
            size: 21,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: {
              top: MARGIN_Y,
              bottom: MARGIN_Y,
              left: MARGIN_X,
              right: MARGIN_X,
            },
          },
        },
        children: buildBlocks(D, blocks),
      },
    ],
  });
  return D.Packer.toBlob(doc);
}

/**
 * 表示中のドキュメント要素を、Word（.docx）として保存する。
 * 資料ファイルは同梱せず、名前だけの文字になる。
 */
export async function downloadDocDocx(
  el: HTMLElement | null,
  filename: string,
  title: string
): Promise<void> {
  if (!el) return;
  const clone = await prepareExportClone(el, false);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:absolute;left:-10000px;top:0;width:860px;background:#fff;pointer-events:none;";
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const blob = await buildDocxBlob(clone, title);
    downloadBlob(
      blob,
      sanitizeFilename(filename.endsWith(".docx") ? filename : `${filename}.docx`)
    );
  } finally {
    host.remove();
  }
}
