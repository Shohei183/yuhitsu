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
  ROLE_LABEL,
  Role,
  YearStore,
  committeeOf,
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

// ── 次第などの担当者候補（実メンバーから生成）────────────────

/**
 * 次第の「担当者 / 司会 / 議事録作成者 / 署名者」の選択肢を、
 * 選択中年度の実メンバーから作る。
 *  - assignees … 役職つき表示（例「青少年育成委員会 委員長 筒井 健太郎」）＋ 先頭に「議長」
 *  - members   … 氏名のみ
 */
export function useAssigneeOptions(): { assignees: string[]; members: string[] } {
  const store = useMemberStore();
  const { yearId } = useActiveView();
  useYearStore();
  return useMemo(() => {
    const active = Object.values(store)
      .filter((m) => m.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    const members = active.map((m) => m.name).filter(Boolean);
    const assignees = active.map((m) => {
      if (!m.name) return "";
      if (m.isMaster) return m.name;
      const role = roleOf(yearId, m.id);
      const cm = committeeOf(yearId, m.id);
      if (role === "committee_chair") {
        return `${cm ? cm.name + " " : ""}委員長 ${m.name}`;
      }
      if (role === "committee_member") {
        return `${cm ? cm.name + " " : ""}${m.name}`;
      }
      return `${ROLE_LABEL[role]} ${m.name}`;
    }).filter(Boolean);
    return { assignees: ["議長", ...assignees], members };
  }, [store, yearId]);
}
