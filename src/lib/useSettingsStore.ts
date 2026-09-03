"use client";

import { useSyncExternalStore } from "react";
import {
  SettingsMap,
  getStore,
  getStoreDefault,
  lomName,
  subscribe,
} from "./settingsStore";

export function useSettingsStore(): SettingsMap {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}

/** 団体名（app_settings.lom_name → env → 既定）。変更で再描画される。 */
export function useLomName(): string {
  useSettingsStore();
  return lomName();
}
