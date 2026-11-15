"use client";

import { useEffect, useRef } from "react";
import {
  RICH_BLACK,
  RICH_RED,
  isRichEmpty,
  sanitizeRichHtml,
} from "@/lib/richText";
import styles from "./RichText.module.css";

/**
 * 黒／赤の2色だけ選べるリッチテキスト入力。
 *  - value / onChange は HTML 文字列
 *  - 選択して色ボタン → その部分だけ色替え
 *  - 未選択で色ボタン → 以降の入力がその色
 *  - readOnly のときはサニタイズ済み HTML をそのまま表示
 */
export default function RichText({
  value,
  onChange,
  readOnly = false,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 外部 value と DOM を同期（編集中＝フォーカス時は触らない：キャレット保持）
  useEffect(() => {
    const el = ref.current;
    if (!el || readOnly) return;
    if (document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value, readOnly]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    onChange(sanitizeRichHtml(el.innerHTML));
  };

  // 貼り付けは、元のフォント・サイズ・色・表などの書式を持ち込まず、
  // すべてこのアプリの書式（MS ゴシック・黒）にする。
  // 例外：このアプリの赤文字をコピーしたときだけ、赤を引き継ぐ。
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    let insert: string;
    if (html && /d21f1f|rgb\(\s*210\s*,\s*31\s*,\s*31\s*\)/i.test(html)) {
      insert = sanitizeRichHtml(html);
    } else {
      insert = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\r\n|\r|\n/g, "<br>");
    }
    if (!insert) return;
    try {
      document.execCommand("insertHTML", false, insert);
    } catch {
      /* 古いブラウザは無視 */
    }
    emit();
  };

  const applyColor = (color: string) => {
    const el = ref.current;
    if (!el || readOnly) return;
    el.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, color);
    } catch {
      /* 古いブラウザは無視 */
    }
    // execCommand 後、innerHTML を拾う（sanitize で <font> や黒 span を正規化）
    onChange(sanitizeRichHtml(el.innerHTML));
  };

  if (readOnly) {
    const html = sanitizeRichHtml(value);
    if (!html)
      return <span className={styles.emptyView}>（未記入）</span>;
    return (
      <div
        className={`${styles.view} ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <span className={styles.barHint}>文字色</span>
        <button
          type="button"
          className={styles.swatch}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyColor(RICH_BLACK)}
        >
          <span className={styles.dot} style={{ background: RICH_BLACK }} />黒
        </button>
        <button
          type="button"
          className={styles.swatch}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyColor(RICH_RED)}
        >
          <span className={styles.dot} style={{ background: RICH_RED }} />赤
        </button>
      </div>
      <div
        ref={ref}
        className={`${styles.editor} ${className ?? ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        data-empty={isRichEmpty(value) ? "true" : undefined}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
      />
    </div>
  );
}
