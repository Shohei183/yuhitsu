"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DistributionPackage,
  DistributionStore,
  getDistribution,
  getDistributionDefault,
  getStore,
  getStoreDefault,
  loadDistribution,
  subscribe,
} from "./distributionStore";

/**
 * 配信データの本体（次第・収録議案の凍結コピー）。開いたときにその 1 件分だけ取得する。
 * loading = 取得中、pkg が無く loading でもない = 存在しない。
 */
export function useDistribution(id: string): {
  pkg: DistributionPackage | undefined;
  loading: boolean;
} {
  const v = useSyncExternalStore(
    subscribe,
    () => getDistribution(id),
    () => getDistributionDefault()
  );
  useEffect(() => {
    if (id) void loadDistribution(id);
  }, [id]);
  return { pkg: v ?? undefined, loading: v === undefined };
}

/** 一覧用の軽い情報（本体は含まない） */
export function useDistributionStore(): DistributionStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
