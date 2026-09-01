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
// ─────────────────────────────────────────────────────────────

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

/**
 * 表示中のドキュメント要素（`<article>` など）を、
 * ページの CSS を同梱した自己完結の HTML ファイルとして保存する。
 * ボタン・リンク・入力欄は静的テキストに置き換える。
 */
export function downloadDocHtml(
  el: HTMLElement | null,
  filename: string,
  title: string
): void {
  if (!el) return;
  const clone = el.cloneNode(true) as HTMLElement;

  // display:none で隠していた「ダウンロード専用」部分を表示に戻す
  clone
    .querySelectorAll<HTMLElement>("[data-export-show]")
    .forEach((n) => (n.style.display = "block"));

  // インタラクティブ要素 → 静的テキスト
  const toSpan = (node: Element, text: string, keepClass = true) => {
    const s = document.createElement("span");
    if (keepClass) s.className = (node as HTMLElement).className;
    s.textContent = text;
    node.replaceWith(s);
  };
  clone
    .querySelectorAll("button")
    .forEach((b) => toSpan(b, b.textContent?.trim() ?? ""));
  clone
    .querySelectorAll("a")
    .forEach((a) => toSpan(a, a.textContent?.trim() ?? ""));
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
    `.__exp [data-export-gian]{break-before:page;margin-top:28px}` +
    `</style></head><body><div class="__exp">${clone.outerHTML}</div></body></html>`;

  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    sanitizeFilename(filename.endsWith(".html") ? filename : `${filename}.html`)
  );
}
