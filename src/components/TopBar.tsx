"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/authStore";
import { setYear } from "@/lib/activeViewStore";
import { ROLE_LABEL, Role } from "@/lib/yearStore";
import {
  useActiveView,
  useAuthMember,
  useCan,
  useEffectiveRole,
  useYears,
} from "@/lib/useOrg";
import { LOM_NAME } from "@/lib/lom";
import styles from "./TopBar.module.css";

const ROLE_CLASS: Record<Role, string> = {
  master: styles.roleMaster,
  president: styles.roleOfficer,
  executive_director: styles.roleOfficer,
  secretary_general: styles.roleOfficer,
  vice_president: styles.roleBoard,
  auditor: styles.roleBoard,
  director: styles.roleBoard,
  committee_chair: styles.roleChair,
  committee_member: styles.roleMember,
};

export default function TopBar() {
  const router = useRouter();
  const member = useAuthMember();
  const years = useYears();
  const view = useActiveView();
  const effectiveRole = useEffectiveRole();
  const can = useCan();

  if (!member) return null;

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link href="/" className={styles.logo} aria-label="ユーヒツ（仮）">
          <span className={styles.logoMark}>ユ</span>
          <span className={styles.logoName}>
            ユーヒツ<span className={styles.logoTag}>(仮)</span>
          </span>
        </Link>
        <span className={styles.lomDivider} aria-hidden="true" />
        <Link href="/" className={styles.lom}>
          {LOM_NAME}
        </Link>
        {member.isMaster && <span className={styles.masterTag}>マスター</span>}
      </div>

      <nav className={styles.center}>
        <div className={styles.years} role="tablist" aria-label="年度">
          {years.map((y) => (
            <button
              key={y.id}
              type="button"
              role="tab"
              aria-selected={y.id === view.yearId}
              className={`${styles.yearTab} ${
                y.id === view.yearId ? styles.yearTabActive : ""
              }`}
              onClick={() => setYear(y.id)}
            >
              {y.label}
            </button>
          ))}
        </div>
      </nav>

      <div className={styles.right}>
        <span className={`${styles.roleBadge} ${ROLE_CLASS[effectiveRole]}`}>
          {ROLE_LABEL[effectiveRole]}
        </span>

        {can.editTemplates && (
          <Link href="/templates" className={styles.navLink}>
            テンプレート
          </Link>
        )}
        {(member.isMaster || can.manageMembers || can.editRoles) && (
          <Link href="/members" className={styles.navLink}>
            メンバー管理
          </Link>
        )}
        {(member.isMaster || can.editRoles) && (
          <Link href="/roles" className={styles.navLink}>
            ロール権限
          </Link>
        )}
        {/* 同期機能は後回し。/sync-lab のルートは残すがナビからは隠す */}

        <button type="button" className={styles.logout} onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </header>
  );
}
