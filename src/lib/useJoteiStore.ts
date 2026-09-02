"use client";

import { useSyncExternalStore } from "react";
import {
  JoteiStore,
  JoteiTodoke,
  getJotei,
  getJoteiDefault,
  getStore,
  getStoreDefault,
  subscribe,
} from "./joteiStore";

export function useJotei(id: string): JoteiTodoke | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getJotei(id),
    () => getJoteiDefault()
  );
}

export function useJoteiStore(): JoteiStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
