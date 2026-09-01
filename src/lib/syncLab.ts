"use client";

// ─────────────────────────────────────────────────────────────
// オフライン編集 × 同期 の実験（Yjs / CRDT）
//
// 目的：クラウドを使わずに「複数クライアントが同じデータを編集し、
// 一部がオフラインになっても再接続時に決定論的にマージされる」ことを
// ローカルだけで確かめる。
//
//  - CRDT エンジン：Yjs（Y.Doc / Y.Array<Y.Map>）
//  - 伝送路：BroadcastChannel（同一ブラウザの別タブ間。サーバー不要）
//  - 永続化：IndexedDB（y-indexeddb。タブを閉じても復元）
//  - 「接続／切断」トグルで、切断中は送受信を止めてローカルに溜め、
//    再接続時に全状態を交換してマージする
//
// 本番の sidaiStore（localStorage）には一切触れていない実験用モジュール。
// ─────────────────────────────────────────────────────────────

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

const ROOM = "yuhitsu-synclab-v1";
const CHANNEL = `ylab:${ROOM}`;

export interface LabRow {
  id: string;
  time: string;
  title: string;
  assignee: string;
}

export interface LabLogEntry {
  id: number;
  at: number;
  text: string;
}

const ROW_KEYS: (keyof LabRow)[] = ["id", "time", "title", "assignee"];

type Listener = () => void;

/** BroadcastChannel で流すメッセージ */
type WireMsg =
  | { t: "update"; u: number[]; from: string }
  | { t: "state"; u: number[]; from: string }
  | { t: "hello"; from: string };

export class SyncLab {
  readonly doc = new Y.Doc();
  readonly rows: Y.Array<Y.Map<string>>;
  /** このタブを表す短いラベル */
  readonly clientTag = Math.random().toString(36).slice(2, 6).toUpperCase();

  private ch: BroadcastChannel | null = null;
  private idb: IndexeddbPersistence | null = null;
  private connected = true;
  /** 切断中に溜まったローカル更新（UI 表示用のカウント） */
  private queued: Uint8Array[] = [];
  private listeners = new Set<Listener>();
  private log: LabLogEntry[] = [];
  private logSeq = 0;
  /** getSnapshot 用の安定参照 */
  private cache: LabRow[] = [];

  restored = false;

  constructor() {
    this.rows = this.doc.getArray<Y.Map<string>>("rows");
    this.recache();

    // ローカル変更 → 接続中なら即送信、切断中はキューへ
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      if (this.connected) {
        this.send({ t: "update", u: Array.from(update), from: this.clientTag });
      } else {
        this.queued.push(update);
      }
      this.emit();
    });

    // 行の中身の変化でも再描画
    this.rows.observeDeep(() => this.emit());

    if (typeof window === "undefined") return;

    // 永続化（タブを閉じても復元）
    this.idb = new IndexeddbPersistence(ROOM, this.doc);
    this.idb.once("synced", () => {
      this.restored = true;
      this.addLog("IndexedDB から復元しました");
      this.emit();
    });

    // 伝送路
    if (typeof BroadcastChannel !== "undefined") {
      this.ch = new BroadcastChannel(CHANNEL);
      this.ch.onmessage = (e: MessageEvent<WireMsg>) => this.onMessage(e.data);
    }

    // 初期は接続状態でスタート → 既存タブへ挨拶して全状態を交換
    this.announce();
    this.addLog(`起動（クライアント ${this.clientTag}）`);
  }

  // ── 伝送 ──
  private send(msg: WireMsg) {
    this.ch?.postMessage(msg);
  }
  private announce() {
    if (!this.connected) return;
    this.send({ t: "hello", from: this.clientTag });
    this.send({
      t: "state",
      u: Array.from(Y.encodeStateAsUpdate(this.doc)),
      from: this.clientTag,
    });
  }
  private onMessage(msg: WireMsg | undefined) {
    if (!msg || !this.connected || msg.from === this.clientTag) return;
    if (msg.t === "hello") {
      // 相手が（再）接続 → こちらの全状態を送る
      this.send({
        t: "state",
        u: Array.from(Y.encodeStateAsUpdate(this.doc)),
        from: this.clientTag,
      });
      return;
    }
    Y.applyUpdate(this.doc, new Uint8Array(msg.u), "remote");
    this.addLog(
      msg.t === "state"
        ? `${msg.from} の全状態を受信してマージ`
        : `${msg.from} の変更を受信して反映`
    );
    this.emit();
  }

  // ── 接続トグル ──
  connect() {
    if (this.connected) return;
    this.connected = true;
    const n = this.queued.length;
    this.queued = [];
    this.addLog(
      n > 0
        ? `再接続：オフライン中の ${n} 件の変更を送信してマージ`
        : "再接続"
    );
    this.announce();
    this.emit();
  }
  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.addLog("切断（オフライン）");
    this.emit();
  }
  toggle() {
    this.connected ? this.disconnect() : this.connect();
  }
  isConnected() {
    return this.connected;
  }
  pendingCount() {
    return this.queued.length;
  }
  getLog() {
    return this.log;
  }

  private addLog(text: string) {
    this.logSeq += 1;
    this.log = [{ id: this.logSeq, at: Date.now(), text }, ...this.log].slice(
      0,
      40
    );
  }

  // ── 行の操作 ──
  addRow() {
    const m = new Y.Map<string>();
    m.set("id", `r-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
    m.set("time", "");
    m.set("title", "");
    m.set("assignee", "");
    this.rows.push([m]);
    this.addLog("行を追加");
  }
  updateRow(id: string, key: keyof LabRow, value: string) {
    const m = this.rows.toArray().find((x) => x.get("id") === id);
    if (m) m.set(key, value);
  }
  removeRow(id: string) {
    const i = this.rows.toArray().findIndex((x) => x.get("id") === id);
    if (i >= 0) {
      this.rows.delete(i, 1);
      this.addLog("行を削除");
    }
  }
  moveRow(id: string, dir: "up" | "down") {
    const i = this.rows.toArray().findIndex((x) => x.get("id") === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= this.rows.length) return;
    this.doc.transact(() => {
      const src = this.rows.get(i);
      const clone = new Y.Map<string>();
      ROW_KEYS.forEach((k) => clone.set(k, src.get(k) ?? ""));
      this.rows.delete(i, 1);
      this.rows.insert(j, [clone]);
    });
    this.addLog(`行を${dir === "up" ? "上" : "下"}へ移動`);
  }
  clearRows() {
    this.doc.transact(() => this.rows.delete(0, this.rows.length));
    this.addLog("全行を削除");
  }

  // ── スナップショット（安定参照）──
  private recache() {
    this.cache = this.rows.toArray().map((m) => ({
      id: m.get("id") ?? "",
      time: m.get("time") ?? "",
      title: m.get("title") ?? "",
      assignee: m.get("assignee") ?? "",
    }));
  }
  snapshot(): LabRow[] {
    return this.cache;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.recache();
    this.listeners.forEach((fn) => fn());
  }

  destroy() {
    try {
      this.ch?.close();
    } catch {
      /* noop */
    }
    try {
      this.idb?.destroy();
    } catch {
      /* noop */
    }
    this.doc.destroy();
  }
}

/** 実験データを IndexedDB からも消す（動作確認用） */
export async function resetSyncLab(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(ROOM);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
