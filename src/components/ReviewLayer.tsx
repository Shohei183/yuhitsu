"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addNote,
  deleteNote,
  notesFor,
  updateNoteBody,
} from "@/lib/reviewNoteStore";
import { useReviewNoteStore } from "@/lib/useReviewNoteStore";
import styles from "./ReviewLayer.module.css";

const HL_NAME = "review-note";

type Anchor = {
  itemKey: string;
  itemLabel: string;
  exact: string;
  prefix: string;
  suffix: string;
};

// ── テキストオフセット ヘルパー ─────────────────────────────
function textLen(node: Node): number {
  return (node.textContent ?? "").length;
}
function offsetIn(root: HTMLElement, node: Node, nodeOffset: number): number {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n === node) return acc + nodeOffset;
    acc += textLen(n);
  }
  // node が要素なら子テキストまでの累積
  if (node instanceof Element) {
    const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let a = 0;
    let m: Node | null;
    while ((m = w2.nextNode())) {
      if (node.contains(m)) return a;
      a += textLen(m);
    }
  }
  return acc;
}
function rangeFromOffsets(
  root: HTMLElement,
  start: number,
  end: number
): Range | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let acc = 0;
  let sset = false;
  let n: Node | null;
  while ((n = w.nextNode())) {
    const len = textLen(n);
    if (!sset && acc + len >= start) {
      r.setStart(n, Math.min(len, Math.max(0, start - acc)));
      sset = true;
    }
    if (sset && acc + len >= end) {
      r.setEnd(n, Math.min(len, Math.max(0, end - acc)));
      return r;
    }
    acc += len;
  }
  return null;
}
function anchorElOf(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el && !el.hasAttribute("data-note-item")) el = el.parentElement;
  return el;
}
function findQuoteRange(
  root: HTMLElement,
  n: { itemKey: string; quoteExact: string; quotePrefix: string; quoteSuffix: string }
): Range | null {
  const itemEl = root.querySelector<HTMLElement>(
    `[data-note-item="${n.itemKey.replace(/"/g, "")}"]`
  );
  if (!itemEl || !n.quoteExact) return null;
  const full = itemEl.textContent ?? "";
  let idx = full.indexOf(n.quotePrefix + n.quoteExact + n.quoteSuffix);
  if (idx >= 0) idx += n.quotePrefix.length;
  else idx = full.indexOf(n.quoteExact);
  if (idx < 0) return null;
  return rangeFromOffsets(itemEl, idx, idx + n.quoteExact.length);
}

export default function ReviewLayer({
  distId,
  gianId,
  children,
}: {
  distId: string;
  gianId: string;
  children: ReactNode;
}) {
  useReviewNoteStore();
  const notes = notesFor(distId, gianId);
  const notesKey = notes.map((n) => n.id + n.updatedAt).join("|");

  const rootRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<
    (Anchor & { top: number; left: number }) | null
  >(null);
  const [editing, setEditing] = useState<
    | { mode: "new"; anchor: Anchor; draft: string }
    | { mode: "edit"; noteId: string; itemLabel: string; draft: string }
    | null
  >(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // ハイライト描画（CSS Custom Highlight API・DOM 非破壊）
  useEffect(() => {
    const root = rootRef.current;
    const CSSh = (typeof CSS !== "undefined" &&
      (CSS as unknown as { highlights?: Map<string, unknown> }).highlights) as
      | Map<string, unknown>
      | undefined;
    const HighlightCtor = (
      window as unknown as { Highlight?: new (...r: Range[]) => unknown }
    ).Highlight;
    if (!root || !CSSh || !HighlightCtor) return;

    const ranges: Range[] = [];
    for (const n of notes) {
      const r = findQuoteRange(root, n);
      if (r) ranges.push(r);
    }
    if (ranges.length) CSSh.set(HL_NAME, new HighlightCtor(...ranges));
    else CSSh.delete(HL_NAME);
    return () => {
      CSSh.delete(HL_NAME);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesKey]);

  // 選択 → 「メモ」ボタン
  const onMouseUp = () => {
    const root = rootRef.current;
    const s = window.getSelection();
    if (!root || !s || s.isCollapsed || s.rangeCount === 0) {
      setSel(null);
      return;
    }
    const range = s.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSel(null);
      return;
    }
    const a = anchorElOf(range.startContainer);
    const b = anchorElOf(range.endContainer);
    if (!a || a !== b) {
      setSel(null);
      return;
    }
    const full = a.textContent ?? "";
    const start = offsetIn(a, range.startContainer, range.startOffset);
    const end = offsetIn(a, range.endContainer, range.endOffset);
    const exact = full.slice(start, end);
    if (!exact.trim()) {
      setSel(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSel({
      itemKey: a.getAttribute("data-note-item") ?? "",
      itemLabel: a.getAttribute("data-note-label") ?? "",
      exact,
      prefix: full.slice(Math.max(0, start - 30), start),
      suffix: full.slice(end, end + 30),
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  };

  // ハイライトのクリック → そのメモを開く
  const onClick = (e: ReactMouseEvent) => {
    const root = rootRef.current;
    if (!root || editing) return;
    for (const n of notes) {
      const r = findQuoteRange(root, n);
      if (!r) continue;
      for (const rc of Array.from(r.getClientRects())) {
        if (
          e.clientX >= rc.left &&
          e.clientX <= rc.right &&
          e.clientY >= rc.top &&
          e.clientY <= rc.bottom
        ) {
          setEditing({
            mode: "edit",
            noteId: n.id,
            itemLabel: n.itemLabel,
            draft: n.body,
          });
          setPanelOpen(true);
          return;
        }
      }
    }
  };

  const startNew = () => {
    if (!sel) return;
    setEditing({
      mode: "new",
      anchor: {
        itemKey: sel.itemKey,
        itemLabel: sel.itemLabel,
        exact: sel.exact,
        prefix: sel.prefix,
        suffix: sel.suffix,
      },
      draft: "",
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
    setPanelOpen(true);
  };

  const save = () => {
    if (!editing) return;
    if (editing.mode === "new") {
      addNote({
        distId,
        gianId,
        itemKey: editing.anchor.itemKey,
        itemLabel: editing.anchor.itemLabel,
        quoteExact: editing.anchor.exact,
        quotePrefix: editing.anchor.prefix,
        quoteSuffix: editing.anchor.suffix,
        body: editing.draft.trim(),
      });
    } else {
      updateNoteBody(editing.noteId, editing.draft.trim());
    }
    setEditing(null);
  };

  const jumpTo = (itemKey: string) => {
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(
      `[data-note-item="${itemKey.replace(/"/g, "")}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add(styles.flash);
      setTimeout(() => el.classList.remove(styles.flash), 1200);
    }
  };

  const anchorEditor = useMemo(() => {
    if (!editing) return null;
    return editing.mode === "new"
      ? editing.anchor.itemLabel
      : editing.itemLabel;
  }, [editing]);

  return (
    <div className={styles.wrap}>
      <div
        ref={rootRef}
        className={styles.doc}
        onMouseUp={onMouseUp}
        onClick={onClick}
      >
        {children}
      </div>

      {/* 選択後のフロート「メモ」ボタン */}
      {sel && !editing && (
        <button
          type="button"
          className={styles.floatBtn}
          style={{ top: sel.top, left: sel.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={startNew}
        >
          💬 メモを追加
        </button>
      )}

      {/* メモ編集ポップオーバー */}
      {editing && (
        <div
          className={styles.editorBackdrop}
          onClick={() => setEditing(null)}
        >
          <div className={styles.editor} onClick={(e) => e.stopPropagation()}>
            <div className={styles.editorHead}>
              <span className={styles.editorItem}>{anchorEditor}</span>
              <span className={styles.privacy}>🔒 自分だけが見えます</span>
            </div>
            {editing.mode === "new" && (
              <blockquote className={styles.quote}>
                {editing.anchor.exact}
              </blockquote>
            )}
            <textarea
              className={styles.textarea}
              autoFocus
              rows={4}
              placeholder="メモ（会議での発言用）"
              value={editing.draft}
              onChange={(e) =>
                setEditing({ ...editing, draft: e.target.value })
              }
            />
            <div className={styles.editorBtns}>
              {editing.mode === "edit" && (
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => {
                    deleteNote(editing.noteId);
                    setEditing(null);
                  }}
                >
                  削除
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setEditing(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={save}
                disabled={!editing.draft.trim()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サイドパネル：自分のメモ一覧 */}
      <button
        type="button"
        className={styles.panelToggle}
        onClick={() => setPanelOpen((v) => !v)}
      >
        🔒 レビューメモ {notes.length > 0 && <b>{notes.length}</b>}
      </button>

      {panelOpen && (
        <aside className={styles.panel}>
          <div className={styles.panelHead}>
            <span>レビューメモ（この議案）</span>
            <button
              type="button"
              className={styles.panelClose}
              onClick={() => setPanelOpen(false)}
            >
              ×
            </button>
          </div>
          <p className={styles.panelNote}>
            🔒 このメモはあなたにしか見えません。会議での発言用です。本文をドラッグ選択すると付けられます。
          </p>
          {notes.length === 0 ? (
            <p className={styles.panelEmpty}>まだメモはありません。</p>
          ) : (
            <ul className={styles.noteList}>
              {notes.map((n) => (
                <li key={n.id} className={styles.noteCard}>
                  <div className={styles.noteItem}>{n.itemLabel}</div>
                  <blockquote className={styles.noteQuote}>
                    {n.quoteExact}
                  </blockquote>
                  <div className={styles.noteBody}>{n.body}</div>
                  <div className={styles.noteCardBtns}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() => jumpTo(n.itemKey)}
                    >
                      該当箇所へ
                    </button>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() =>
                        setEditing({
                          mode: "edit",
                          noteId: n.id,
                          itemLabel: n.itemLabel,
                          draft: n.body,
                        })
                      }
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className={styles.miniDel}
                      onClick={() => deleteNote(n.id)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
