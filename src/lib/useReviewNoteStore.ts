"use client";

import { useSyncExternalStore } from "react";
import {
  ReviewNoteStore,
  getStore,
  getStoreDefault,
  subscribe,
} from "./reviewNoteStore";

export function useReviewNoteStore(): ReviewNoteStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
