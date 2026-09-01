"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  AuthState,
  getState as getAuthState,
  getStateDefault as getAuthStateDefault,
  subscribe as subscribeAuth,
} from "./authStore";
import {
  Member,
  MemberStore,
  getMember,
  getMemberDefault,
  getStore as getMemberStore,
  getStoreDefault as getMemberStoreDefault,
  subscribe as subscribeMembers,
} from "./memberStore";
import {
  Committee,
  FiscalYear,
  Role,
  YearStore,
  getStore as getYearStore,
  getStoreDefault as getYearStoreDefault,
  getYear,
  getYearDefault,
  listYears,
  roleOf,
  subscribe as subscribeYears,
} from "./yearStore";
import {
  ActiveView,
  getState as getActiveView,
  getStateDefault as getActiveViewDefault,
  subscribe as subscribeActiveView,
} from "./activeViewStore";
import { Capability, CAPABILITY_KEYS } from "./permissions";
import {
  RolePermOverrides,
  can,
  getStore as getRolePermStore,
  getStoreDefault as getRolePermStoreDefault,
  subscribe as subscribeRolePerm,
} from "./rolePermStore";

// ── 個別フック ───────────────────────────────────────────────

export function useAuthState(): AuthState {
  return useSyncExternalStore(
    subscribeAuth,
    getAuthState,
    getAuthStateDefault
  );
}

export function useAuthMember(): Member | null {
  const { currentMemberId } = useAuthState();
  const member = useSyncExternalStore(
    subscribeMembers,
    () => (currentMemberId ? getMember(currentMemberId) : undefined),
    () => (currentMemberId ? getMemberDefault(currentMemberId) : undefined)
  );
  if (!member || member.status === "retired") return null;
  return member;
}

export function useMemberStore(): MemberStore {
  return useSyncExternalStore(
    subscribeMembers,
    getMemberStore,
    getMemberStoreDefault
  );
}

export function useYearStore(): YearStore {
  return useSyncExternalStore(subscribeYears, getYearStore, getYearStoreDefault);
}

export function useYears(): FiscalYear[] {
  useYearStore();
  return listYears();
}

export function useActiveView(): ActiveView {
  return useSyncExternalStore(
    subscribeActiveView,
    getActiveView,
    getActiveViewDefault
  );
}

export function useActiveYear(): FiscalYear | undefined {
  const { yearId } = useActiveView();
  return useSyncExternalStore(
    subscribeYears,
    () => getYear(yearId),
    () => getYearDefault(yearId)
  );
}

export function useCommittee(committeeId: string):
  | { year: FiscalYear; committee: Committee }
  | undefined {
  // useSyncExternalStore の getSnapshot は安定参照を返す必要があるため、
  // 安定参照の store から useMemo で導出する。
  const store = useYearStore();
  return useMemo(() => {
    for (const year of Object.values(store)) {
      const committee = year.committees.find((c) => c.id === committeeId);
      if (committee) return { year, committee };
    }
    return undefined;
  }, [store, committeeId]);
}

/** 議案 id からその所属委員会・年度 */
export function useCommitteeOfGian(gianId: string):
  | { year: FiscalYear; committee: Committee }
  | undefined {
  const store = useYearStore();
  return useMemo(() => {
    for (const year of Object.values(store)) {
      const committee = year.committees.find((c) =>
        c.gianIds.includes(gianId)
      );
      if (committee) return { year, committee };
    }
    return undefined;
  }, [store, gianId]);
}

// ── ロール / 権限 ────────────────────────────────────────────

/** 実効ロール（デモ上書き → master 属性 → 年度割当 の順で決定） */
export function useEffectiveRole(): Role {
  const member = useAuthMember();
  const { yearId, roleOverride } = useActiveView();
  useYearStore(); // 割当変更で再評価
  if (member?.isMaster) return "master";
  if (roleOverride) return roleOverride;
  return roleOf(yearId, member?.id ?? null);
}

export type CanMap = Record<Capability, boolean>;

/**
 * 実効ロール × ロール権限ストア（/roles でマスターが編集）から、
 * 現在のユーザーの操作可否を解決する。
 */
export function useCan(): CanMap {
  const role = useEffectiveRole();
  useRolePermStore(); // 権限変更で再評価
  const out = {} as CanMap;
  for (const k of CAPABILITY_KEYS) out[k] = can(role, k);
  return out;
}

export function useRolePermStore(): RolePermOverrides {
  return useSyncExternalStore(
    subscribeRolePerm,
    getRolePermStore,
    getRolePermStoreDefault
  );
}
