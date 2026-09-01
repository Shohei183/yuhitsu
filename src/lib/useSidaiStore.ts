"use client";

import { useSyncExternalStore } from "react";
import {
  Sidai,
  SidaiStore,
  getSidai,
  getSidaiDefault,
  getStore,
  getStoreDefault,
  subscribe,
} from "./sidaiStore";

export function useSidai(id: string): Sidai | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getSidai(id),
    () => getSidaiDefault()
  );
}

export function useSidaiStore(): SidaiStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
