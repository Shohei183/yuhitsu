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
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthStateDefault);
}

export function useAuthMember(): Member | null {
  const { userId } = useAuthState();
  useMemberStore(); // メンバーのハイドレーション／変更で再評価
  if (!userId) return null;
  const member = getMember(userId);
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
  useYearStore();
  return getYear(yearId);
}

export function useCommittee(committeeId: string):
  | { year: FiscalYear; committee: Committee }
  | undefined {
  const store = useYearStore();
  return useMemo(() => {
    for (const year of Object.values(store)) {
      const committee = year.committees.find((c) => c.id === committeeId);
      if (committee) return { year, committee };
    }
    return undefined;
  }, [store, committeeId]);
}

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

export function useEffectiveRole(): Role {
  const member = useAuthMember();
  const { yearId, roleOverride } = useActiveView();
  useYearStore();
  if (member?.isMaster) return "master";
  if (roleOverride) return roleOverride;
  return roleOf(yearId, member?.id ?? null);
}

export type CanMap = Record<Capability, boolean>;

export function useCan(): CanMap {
  const role = useEffectiveRole();
  useRolePermStore();
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
