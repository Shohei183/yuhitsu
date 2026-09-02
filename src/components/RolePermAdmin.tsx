"use client";

import { useState } from "react";
import Link from "next/link";
import { ROLE_LABEL, Role } from "@/lib/yearStore";
import {
  CAPABILITIES,
  Capability,
  EDITABLE_ROLES,
} from "@/lib/permissions";
import {
  isRoleCustomized,
  permsForRole,
  resetRole,
  setPerm,
} from "@/lib/rolePermStore";
import {
  useAuthMember,
  useEffectiveRole,
  useRolePermStore,
} from "@/lib/useOrg";
import styles from "./RolePermAdmin.module.css";

export default function RolePermAdmin() {
  useRolePermStore(); // 変更で再描画
  const me = useAuthMember();
  const myRole = useEffectiveRole();
  const [role, setRole] = useState<Role>("committee_chair");

  if (!me) return null;

  if (!me.isMaster) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.title}>ロール権限の設定</h1>
        <p className={styles.denied}>
          この画面はマスターアカウントのみが利用できます。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </main>
    );
  }

  const perms = permsForRole(role);
  const customized = isRoleCustomized(role);

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>LOM ／ ロール権限の設定</div>
        <h1 className={styles.title}>ロール権限の設定</h1>
        <p className={styles.note}>
          ロールを選び、そのロールでできる操作をチェックで切り替えます。変更は即座に反映され、
          該当ロールのユーザー（および上部バーの「デモ表示」で切り替えたロール）で挙動が変わります。
        </p>
        <p className={styles.note}>
          いまログイン中のあなたの実効ロール：
          <strong>{ROLE_LABEL[myRole]}</strong>
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      <div className={styles.roleTabs}>
        {EDITABLE_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={`${styles.roleTab} ${
              r === role ? styles.roleTabActive : ""
            }`}
            onClick={() => setRole(r)}
          >
            {ROLE_LABEL[r]}
            {isRoleCustomized(r) && <span className={styles.dot} title="既定から変更あり">●</span>}
          </button>
        ))}
        <span className={styles.masterNote}>
          マスターは常にすべて許可（変更不可）
        </span>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>
            「{ROLE_LABEL[role]}」の操作権限
          </span>
          {customized && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => resetRole(role)}
            >
              このロールを既定に戻す
            </button>
          )}
        </div>

        <ul className={styles.capList}>
          {CAPABILITIES.map((c) => {
            const checked = perms[c.key as Capability];
            return (
              <li key={c.key} className={styles.capItem}>
                <label className={styles.capLabel}>
                  <input
                    type="checkbox"
                    className={styles.capCheck}
                    checked={checked}
                    onChange={(e) => setPerm(role, c.key, e.target.checked)}
                  />
                  <span className={styles.capText}>
                    <span className={styles.capName}>
                      {c.label}
                      {!c.enforced && (
                        <span className={styles.defOnly} title="定義のみ（画面での制御は次ステップ）">
                          定義のみ
                        </span>
                      )}
                    </span>
                    <span className={styles.capDesc}>{c.desc}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
