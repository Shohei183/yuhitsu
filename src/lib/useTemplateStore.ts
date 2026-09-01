"use client";

import { useSyncExternalStore } from "react";
import {
  TemplateStore,
  YearTemplate,
  getStore,
  getStoreDefault,
  getTemplate,
  getTemplateDefault,
  subscribe,
} from "./templateStore";

export function useTemplateStore(): TemplateStore {
  return useSyncExternalStore(subscribe, getStore, getStoreDefault);
}

export function useTemplate(yearId: string): YearTemplate {
  return useSyncExternalStore(
    subscribe,
    () => getTemplate(yearId),
    () => getTemplateDefault(yearId)
  );
}
