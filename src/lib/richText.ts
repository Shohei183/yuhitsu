// ─────────────────────────────────────────────────────────────
// リッチテキスト（黒／赤の2色のみ）の保存値サニタイズ
//
//  保存値は HTML 文字列。許可するのは
//    - テキスト
//    - <br>
//    - <span style="color:#d21f1f"> …赤のみ（黒は既定色なので span 不要）
//  それ以外のタグ・属性・色は捨てる（テキストは残す）。
//  execCommand が作る <font color> や rgb() 表記も吸収する。
// ─────────────────────────────────────────────────────────────

export const RICH_BLACK = "#1a2230";
export const RICH_RED = "#d21f1f";

function isRed(raw: string): boolean {
  const c = raw.trim().toLowerCase().replace(/\s+/g, "");
  return (
    c === "#d21f1f" ||
    c === "#d22" ||
    c === "red" ||
    c === "rgb(210,31,31)" ||
    c === "rgb(210,31,31,1)"
  );
}

/** HTML → 安全な HTML（テキスト＋<br>＋赤 span のみ）。空なら "" */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    // SSR フォールバック：タグを外してテキストだけ
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim()
      .replace(/\n/g, "<br>");
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const out = document.createElement("div");

  const walk = (src: Node, dst: HTMLElement) => {
    src.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        dst.appendChild(document.createTextNode(node.textContent ?? ""));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === "script" || tag === "style" || tag === "noscript") return;

      if (tag === "br") {
        dst.appendChild(document.createElement("br"));
        return;
      }

      const colorRaw =
        el.style?.color ||
        (tag === "font" ? el.getAttribute("color") || "" : "");
      const red = colorRaw ? isRed(colorRaw) : false;

      if (red) {
        const span = document.createElement("span");
        span.setAttribute("style", `color:${RICH_RED}`);
        dst.appendChild(span);
        walk(el, span);
        return;
      }

      // ブロック要素は前の内容の後ろで改行を1つ入れる
      if ((tag === "div" || tag === "p") && dst.childNodes.length > 0) {
        dst.appendChild(document.createElement("br"));
      }
      // それ以外（span 黒 / b / i / 未知タグ）は「はがして」中身だけ
      walk(el, dst);
    });
  };

  walk(tpl.content, out);

  // 末尾の余分な <br> を1つだけ削る
  let h = out.innerHTML;
  h = h.replace(/(<br\s*\/?>)+$/i, "");
  return h;
}

/** リッチテキストからプレーン文字列（検索・ファイル名用） */
export function richToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeRichHtml(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 中身が空か（タグだけ・空白だけ） */
export function isRichEmpty(html: string | null | undefined): boolean {
  return richToPlain(html) === "";
}
