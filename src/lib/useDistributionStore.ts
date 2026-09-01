"use client";

import { useSyncExternalStore } from "react";
import {
  DistributionPackage,
  DistributionStore,
  getDistribution,
  getDistributionDefault,
  getStore,
  getStoreDefault,
  subscribe,
} from "./distributionStore";

export function useDistribution(id: string): DistributionPackage | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getDistribution(id),
    () => getDistributionDefault()
  );
}

export function useDistributionStore(): DistributionStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
