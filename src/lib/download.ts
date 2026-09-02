"use client";

// ─────────────────────────────────────────────────────────────
// ダウンロード用ヘルパー
//
//  - downloadBlob        : Blob をファイルとして保存
//  - downloadFileAsync   : IndexedDB などから非同期に Blob を取って「必ずダウンロード」
//  - downloadDocHtml     : 画面に表示中のドキュメント DOM を、
//                          そのページの CSS を丸ごと同梱した単一 HTML ファイルにして保存
//
// クラウド不要。ダウンロードした HTML はオフラインでそのまま開けて、
// ブラウザの印刷から A4 PDF にもできる（@page 指定を同梱）。
//
// リンクの扱い（downloadDocHtml）:
//  - [data-file-id]   … 資料ファイルの実体を data: URI で HTML に同梱し <a download> にする
//  - [data-doc-anchor]… 同じ HTML 内の別セクション（例：次第の議案名→議案本文）への
//                        ページ内アンカー <a href="#..."> にする（対象が無ければただの文字）
//  - それ以外の <a>/<button>/入力欄 … 静的テキストに置き換える
// ─────────────────────────────────────────────────────────────

import { getFileBlobById } from "./backend/files";

/** ファイル名に使えない文字を _ に置換 */
export function sanitizeFilename(s: string): string {
  return (s || "download").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120);
}

/** Blob をファイルとして保存する */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 非同期に取得した Blob を「必ずダウンロード」する（開くのではなく保存）。
 * openFileAsync（表示できる形式はタブで開く）と対になる関数。
 */
export function downloadFileAsync(
  name: string,
  fetchBlob: () => Promise<Blob | null | undefined>
): void {
  fetchBlob().then((blob) => {
    if (!blob) return;
    downloadBlob(blob, sanitizeFilename(name));
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 同一オリジンの全スタイルシートのルールを 1 つの文字列に集める */
function collectPageCss(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        css += rule.cssText + "\n";
      }
    } catch {
      // クロスオリジン（Google Fonts 等）は読めないのでスキップ
    }
  }
  return css;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

/**
 * 表示中のドキュメント要素（`<article>` など）を、
 * ページの CSS を同梱した自己完結の HTML ファイルとして保存する。
 *
 * 資料ファイル（[data-file-id]）は実体を HTML に同梱するため、
 * 大きな資料が多いと生成に時間がかかり、ファイルも大きくなる。
 */
export async function downloadDocHtml(
  el: HTMLElement | null,
  filename: string,
  title: string
): Promise<void> {
  if (!el) return;
  const clone = el.cloneNode(true) as HTMLElement;

  // display:none で隠していた「ダウンロード専用」部分を表示に戻す
  clone
    .querySelectorAll<HTMLElement>("[data-export-show]")
    .forEach((n) => (n.style.display = "block"));

  const toSpan = (node: Element, text: string, keepClass = true) => {
    const s = document.createElement("span");
    if (keepClass) s.className = (node as HTMLElement).className;
    s.textContent = text;
    node.replaceWith(s);
  };

  // 1) 資料ファイルリンク → 実体を data: URI で同梱した <a download>
  const fileNodes = Array.from(
    clone.querySelectorAll<HTMLElement>("[data-file-id]")
  );
  await Promise.all(
    fileNodes.map(async (node) => {
      const id = node.getAttribute("data-file-id") || "";
      const label = node.textContent?.trim() || "";
      const name =
        node.getAttribute("data-file-name") || label || "download";
      try {
        const got = id ? await getFileBlobById(id) : undefined;
        if (!got) throw new Error("not found");
        const dataUrl = await blobToDataUrl(got.blob);
        const a = document.createElement("a");
        a.className = (node as HTMLElement).className;
        a.setAttribute("href", dataUrl);
        a.setAttribute("download", name);
        a.textContent = label || name;
        node.replaceWith(a);
      } catch {
        toSpan(node, label || name);
      }
    })
  );

  // 2) ドキュメント内アンカー（例：次第の議案名 → 議案本文）
  clone
    .querySelectorAll<HTMLElement>("[data-doc-anchor]")
    .forEach((node) => {
      const anchor = node.getAttribute("data-doc-anchor") || "";
      const label = node.textContent?.trim() ?? "";
      const target =
        anchor && clone.querySelector(`[id="${anchor.replace(/"/g, "")}"]`);
      if (target) {
        const a = document.createElement("a");
        a.className = (node as HTMLElement).className;
        a.setAttribute("href", `#${anchor}`);
        a.textContent = label;
        node.replaceWith(a);
      } else {
        toSpan(node, label);
      }
    });

  // 3) 残りのインタラクティブ要素 → 静的テキスト
  clone
    .querySelectorAll("button")
    .forEach((b) => toSpan(b, b.textContent?.trim() ?? ""));
  clone.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    // 同梱リンク（data:）・ページ内アンカー（#）は残す
    if (href.startsWith("data:") || href.startsWith("#")) return;
    toSpan(a, a.textContent?.trim() ?? "");
  });
  clone.querySelectorAll("input, textarea").forEach((i) => {
    toSpan(i, (i as HTMLInputElement).value ?? "", false);
  });
  clone.querySelectorAll("select").forEach((sel) => {
    toSpan(
      sel,
      (sel as HTMLSelectElement).selectedOptions[0]?.textContent ?? "",
      false
    );
  });

  const css = collectPageCss();
  const html =
    `<!doctype html><html lang="ja"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>\n${css}\n` +
    `@page{size:A4 portrait;margin:14mm 12mm}` +
    `html,body{margin:0;background:#fff;color:#1a2230}` +
    `body{display:flex;justify-content:center;padding:16px}` +
    `.__exp{max-width:900px;width:100%}` +
    `.__exp [data-export-gian]{break-before:page;margin-top:28px;scroll-margin-top:12px}` +
    `</style></head><body><div class="__exp">${clone.outerHTML}</div></body></html>`;

  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    sanitizeFilename(filename.endsWith(".html") ? filename : `${filename}.html`)
  );
}
