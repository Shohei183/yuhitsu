"use client";

import { useState } from "react";
import Link from "next/link";
import {
  issueAccount,
  listMembers,
  setMemberStatus,
  updateMember,
} from "@/lib/memberStore";
import {
  ROLE_LABEL,
  Role,
  SELECTABLE_ROLES,
  roleOf,
  setAssignment,
} from "@/lib/yearStore";
import {
  useActiveView,
  useActiveYear,
  useAuthMember,
  useCan,
  useMemberStore,
  useYearStore,
} from "@/lib/useOrg";
import styles from "./MemberAdmin.module.css";

export default function MemberAdmin() {
  useMemberStore(); // 変更で再描画
  useYearStore();
  const me = useAuthMember();
  const { yearId } = useActiveView();
  const year = useActiveYear();
  const can = useCan();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    email: string;
    err: string | null;
  } | null>(null);

  if (!me) return null;

  if (!me.isMaster) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.title}>メンバー管理</h1>
        <p className={styles.denied}>
          この画面はマスターアカウントのみが利用できます。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </main>
    );
  }

  const members = listMembers();
  const canEditRoles = can.editRoles;

  const onIssue = (e: React.FormEvent) => {
    e.preventDefault();
    const created = issueAccount({ name, email });
    if (created) {
      setFlash(`${created.name} のアカウントを発行しました（初期パスワード: jc）`);
      setName("");
      setEmail("");
    } else {
      setFlash("発行できませんでした（氏名・メール未入力、またはメール重複）");
    }
    window.setTimeout(() => setFlash(null), 3200);
  };

  const committeeIdOf = (memberId: string): string | null => {
    const a = year?.assignments.find((x) => x.memberId === memberId);
    return a?.committeeId ?? null;
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>LOM ／ メンバー管理</div>
        <h1 className={styles.title}>メンバー管理</h1>
        <p className={styles.note}>
          アカウントの発行・退会（LOM 全体・年度非依存）と、
          <strong>{year?.label ?? yearId}</strong> のロール割当を行います。
          年度は上部バーの年度タブで切り替えます。プロトタイプのためダミーデータです。
        </p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      {flash && <div className={styles.flash}>{flash}</div>}

      <form className={styles.issue} onSubmit={onIssue}>
        <div className={styles.issueTitle}>＋ アカウント発行</div>
        <div className={styles.issueRow}>
          <input
            className={styles.issueInput}
            value={name}
            placeholder="氏名（例：田中 太郎）"
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className={styles.issueInput}
            type="email"
            value={email}
            placeholder="メール（例：tanaka@komaki-jc.example）"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className={styles.issueBtn}>
            発行
          </button>
        </div>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>氏名</th>
              <th>{year?.label ?? yearId} のロール</th>
              <th>担当委員会</th>
              <th>変更</th>
              <th>アカウント</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const role: Role = m.isMaster
                ? "master"
                : roleOf(yearId, m.id);
              const committeeId = committeeIdOf(m.id);
              return (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {m.isMaster && (
                      <span className={styles.masterMark}>マスター</span>
                    )}
                    {!m.isMaster && m.status === "retired" && (
                      <span className={styles.retiredMark}>無効</span>
                    )}
                  </td>
                  <td>
                    {m.isMaster ? (
                      <span className={styles.dim}>全権限</span>
                    ) : canEditRoles ? (
                      <select
                        className={styles.roleSelect}
                        value={role}
                        onChange={(e) =>
                          setAssignment(
                            yearId,
                            m.id,
                            e.target.value as Role,
                            committeeId
                          )
                        }
                      >
                        {SELECTABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[role]
                    )}
                  </td>
                  <td>
                    {m.isMaster ? (
                      <span className={styles.dim}>—</span>
                    ) : canEditRoles ? (
                      <select
                        className={styles.roleSelect}
                        value={committeeId ?? ""}
                        onChange={(e) =>
                          setAssignment(
                            yearId,
                            m.id,
                            role,
                            e.target.value || null
                          )
                        }
                      >
                        <option value="">（未設定）</option>
                        {(year?.committees ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      year?.committees.find((c) => c.id === committeeId)?.name ??
                      "（未設定）"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.rowBtn}
                      onClick={() =>
                        setEditing({
                          id: m.id,
                          name: m.name,
                          email: m.email,
                          err: null,
                        })
                      }
                    >
                      変更
                    </button>
                  </td>
                  <td>
                    {m.isMaster ? (
                      <span className={styles.dim}>—</span>
                    ) : m.status === "active" ? (
                      <button
                        type="button"
                        className={styles.rowBtn}
                        onClick={() => setMemberStatus(m.id, "retired")}
                      >
                        無効化
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.rowBtn}
                        onClick={() => setMemberStatus(m.id, "active")}
                      >
                        有効化
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setEditing(null)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalTitle}>氏名・メールアドレスの変更</div>
            <label className={styles.modalLabel}>
              氏名
              <input
                className={styles.modalInput}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value, err: null })
                }
              />
            </label>
            <label className={styles.modalLabel}>
              メールアドレス
              <input
                className={styles.modalInput}
                type="email"
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value, err: null })
                }
              />
            </label>
            {editing.err && (
              <div className={styles.modalErr}>{editing.err}</div>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.rowBtn}
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.issueBtn}
                onClick={() => {
                  const ok = updateMember(editing.id, {
                    name: editing.name,
                    email: editing.email,
                  });
                  if (ok) {
                    setFlash("メンバー情報を更新しました");
                    setEditing(null);
                    window.setTimeout(() => setFlash(null), 3200);
                  } else {
                    setEditing({
                      ...editing,
                      err: "更新できませんでした（メールアドレスの重複など）",
                    });
                  }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
