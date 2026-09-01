"use client";

import { useSyncExternalStore } from "react";
import {
  GianEntry,
  GianStore,
  getEntry,
  getEntryDefault,
  getStore,
  getStoreDefault,
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
