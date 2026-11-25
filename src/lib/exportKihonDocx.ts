"use client";

// ─────────────────────────────────────────────────────────────
// 基本方針の Word（.docx）出力：従来様式
//
//  原本（サンプル/事務局基本方針vr1.docx）に合わせる：
//   A4縦／余白 上15mm（原本は30mm）・下30mm・左右20mm／MS ゴシック 12pt／行送り 18pt（固定）
//   3列の表（見出し欄 1464・中 4170・右 4202 twip）
// ─────────────────────────────────────────────────────────────

import { KihonLegacy, splitRoleLines } from "./kihonLegacy";
import { RICH_RED } from "./richText";
import { downloadBlob, sanitizeFilename } from "./download";

type D = typeof import("docx");

const FONT = "ＭＳ ゴシック";
const PAGE_W = 11907;
const PAGE_H = 16840;
const COLS = [1464, 4170, 4202] as const;
const LINE = 360; // 18pt

export async function buildKihonDocxBlob(d: KihonLegacy): Promise<Blob> {
  const D = await import("docx");

  const run = (text: string, red?: boolean) =>
    new D.TextRun({ text, color: red ? RICH_RED.replace("#", "") : undefined });

  const para = (
    children: InstanceType<D["TextRun"]>[] | string,
    opts: {
      align?: "left" | "center" | "right";
      firstLine?: number;
      right?: number;
      tabAt?: number;
    } = {}
  ) =>
    new D.Paragraph({
      children: typeof children === "string" ? [run(children)] : children,
      alignment:
        opts.align === "center"
          ? D.AlignmentType.CENTER
          : opts.align === "right"
            ? D.AlignmentType.RIGHT
            : D.AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: LINE, lineRule: D.LineRuleType.EXACT },
      indent:
        opts.firstLine || opts.right
          ? { firstLine: opts.firstLine, right: opts.right }
          : undefined,
      tabStops:
        opts.tabAt !== undefined
          ? [{ type: D.TabStopType.RIGHT, position: opts.tabAt }]
          : undefined,
    });

  const blank = () => para("");

  const single = { style: D.BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: single, bottom: single, left: single, right: single };

  const cell = (
    children: InstanceType<D["Paragraph"]>[],
    width: number,
    extra: {
      columnSpan?: number;
      rowSpan?: number;
      middle?: boolean;
    } = {}
  ) =>
    new D.TableCell({
      children: children.length ? children : [blank()],
      width: { size: width, type: D.WidthType.DXA },
      columnSpan: extra.columnSpan,
      rowSpan: extra.rowSpan,
      verticalAlign: extra.middle ? D.VerticalAlign.CENTER : D.VerticalAlign.TOP,
      borders,
    });

  // ── 表の各行 ──
  const leadParas: InstanceType<D["Paragraph"]>[] = [para("担当")];
  for (const p of d.leads) {
    for (const r of splitRoleLines(p.role)) leadParas.push(para(r));
    leadParas.push(para(p.name));
  }
  const memberParas = d.members.map((p) => para(`${p.role}　${p.name}`));

  const policyParas = d.policy.map((pr) =>
    para(
      // 字下げは、入力したスペースをそのまま出す（自動では付けない）
      pr.length ? pr.map((r) => run(r.text, r.red)) : [run("")]
    )
  );

  const lines = (items: string[]) => items.map((t) => para(t));

  const moneyParas = (items: KihonLegacy["income"], tabAt: number) => {
    const ps = items.map((l) =>
      para(`${l.label}\t${l.amount}`, { tabAt })
    );
    // 原本の科目欄の余白（空行）に合わせて、最低6行ぶんの高さにする
    while (ps.length < 6) ps.push(blank());
    return ps;
  };

  const rowsOf = [
    new D.TableRow({
      children: [
        cell(leadParas, COLS[0]),
        cell(memberParas, COLS[1] + COLS[2], { columnSpan: 2 }),
      ],
      cantSplit: true,
    }),
    new D.TableRow({
      children: [
        cell([], COLS[0]),
        cell(policyParas, COLS[1] + COLS[2], { columnSpan: 2 }),
      ],
    }),
    new D.TableRow({
      children: [
        cell([], COLS[0]),
        cell(lines(d.plans), COLS[1] + COLS[2], { columnSpan: 2 }),
      ],
      cantSplit: true,
    }),
    new D.TableRow({
      children: [
        cell([], COLS[0]),
        cell(lines(d.schedule), COLS[1] + COLS[2], { columnSpan: 2 }),
      ],
      cantSplit: true,
    }),
    new D.TableRow({
      children: [
        cell([para("委員会予算")], COLS[0], { rowSpan: 3, middle: true }),
        cell([para("収　入　の　部", { align: "center" })], COLS[1]),
        cell([para("支　出　の　部", { align: "center" })], COLS[2]),
      ],
      cantSplit: true,
    }),
    new D.TableRow({
      children: [
        cell(moneyParas(d.income, COLS[1] - 220), COLS[1]),
        cell(moneyParas(d.expense, COLS[2] - 220), COLS[2]),
      ],
      cantSplit: true,
    }),
    new D.TableRow({
      children: [
        cell([para(`合計　${d.incomeTotal}`, { align: "right" })], COLS[1]),
        cell([para(`合計　${d.expenseTotal}`, { align: "right" })], COLS[2]),
      ],
      cantSplit: true,
    }),
  ];

  const table = new D.Table({
    width: { size: COLS[0] + COLS[1] + COLS[2], type: D.WidthType.DXA },
    columnWidths: [...COLS],
    layout: D.TableLayoutType.FIXED,
    rows: rowsOf,
  });

  const head: InstanceType<D["Paragraph"]>[] = [
    para(d.title, { align: "center" }),
  ];
  if (d.chair) head.push(para(d.chair, { align: "right", right: 960 }));

  const doc = new D.Document({
    creator: "ユーヒツ",
    title: d.title,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT },
            size: 24,
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
              top: 851, // 15mm（原本は30mm）
              bottom: 1701,
              left: 1134,
              right: 1134,
              header: 851,
              footer: 992,
            },
          },
        },
        children: [...head, table, blank()],
      },
    ],
  });
  return D.Packer.toBlob(doc);
}

export async function downloadKihonDocx(
  d: KihonLegacy,
  filename: string
): Promise<void> {
  const blob = await buildKihonDocxBlob(d);
  downloadBlob(
    blob,
    sanitizeFilename(filename.endsWith(".docx") ? filename : `${filename}.docx`)
  );
}
