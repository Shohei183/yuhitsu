"use client";

import { useSyncExternalStore } from "react";
import {
  CommitteeReportStore,
  getStore,
  getStoreDefault,
  subscribe,
} from "./committeeReportStore";

export function useCommitteeReportStore(): CommitteeReportStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
