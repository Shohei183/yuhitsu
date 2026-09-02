"use client";

import { useSyncExternalStore } from "react";
import {
  BudgetDoc,
  BudgetStore,
  getBudget,
  getBudgetDefault,
  getStore,
  getStoreDefault,
  subscribe,
} from "./budgetStore";

export function useBudget(id: string): BudgetDoc | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getBudget(id),
    () => getBudgetDefault()
  );
}

export function useBudgetStore(): BudgetStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}
