"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  GianEntry,
  GianStore,
  areSnapshotsLoaded,
  getEntry,
  getEntryDefault,
  getStore,
  getStoreDefault,
  loadSnapshots,
  subscribe,
} from "./gianStore";

/** 1 議案ぶんの状態（localStorage 連動）。サーバー／ハイドレーション時は初期状態を返す。 */
export function useGianEntry(id: string): GianEntry | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getEntry(id),
    () => getEntryDefault()
  );
}

/** ストア全体（一覧表示用） */
export function useGianStore(): GianStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}

/**
 * 1 議案のスナップショット履歴。履歴は容量が大きいので起動時には読み込まず、
 * この hook を使う画面が開いたときにその議案の分だけ取得する。
 * enabled=false のあいだは取得しない（過去版の表示が無い画面など）。
 */
export function useGianSnapshots(
  id: string,
  enabled = true
): { snapshots: GianEntry["snapshots"]; loaded: boolean } {
  const entry = useGianEntry(id);
  useEffect(() => {
    if (enabled && id) void loadSnapshots(id);
  }, [id, enabled]);
  return {
    snapshots: entry?.snapshots ?? [],
    loaded: areSnapshotsLoaded(id),
  };
}
