"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo } from "react";
import {
  JoteiSection,
  JOTEI_SECTIONS,
  blankItem,
  deleteJotei,
  listJoteiForYear,
  reopenJotei,
  saveJotei,
  sectionItems,
  submitJotei,
  withSection,
} from "@/lib/joteiStore";
import { useJotei, useJoteiStore } from "@/lib/useJoteiStore";
import { listSidai } from "@/lib/sidaiStore";
import { useSidaiStore } from "@/lib/useSidaiStore";
import { useCommittee, useAuthMember, useCan } from "@/lib/useOrg";
import styles from "./JoteiEditor.module.css";

export default function JoteiEditor({ joteiId }: { joteiId: string }) {
  const router = useRouter();
  const jotei = useJotei(joteiId);
  useJoteiStore();
  useSidaiStore();
  const found = useCommittee(jotei?.committeeId ?? "");
  const member = useAuthMember();
  const can = useCan();
  const listId = useId();

  const meetingSuggestions = useMemo(() => {
    const yid = jotei?.yearId ?? "";
    const names = new Set<string>();
    for (const j of listJoteiForYear(yid)) {
      if (j.meetingName.trim()) names.add(j.meetingName.trim());
    }
    for (const s of listSidai()) {
      if (s.yearId === yid && s.meetingName.trim()) names.add(s.meetingName.trim());
    }
    return [...names].sort();
  }, [jotei?.yearId]);

  if (!jotei) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>上程届が見つかりません。</p>
          <Link href="/jotei" className={styles.navLink}>
            ← 上程届一覧
          </Link>
        </div>
      </div>
    );
  }

  const readOnly = jotei.status === "submitted";
  const backHref = jotei.committeeId
    ? `/committee/${jotei.committeeId}/jotei`
    : "/jotei";

  const update = (patch: Partial<typeof jotei>) =>
    saveJotei(joteiId, { ...jotei, ...patch });

  const mutateSection = (
    s: JoteiSection,
    fn: (items: ReturnType<typeof sectionItems>) => ReturnType<typeof sectionItems>
  ) => saveJotei(joteiId, withSection(jotei, s, fn(sectionItems(jotei, s))));

  const onSubmit = () => {
    if (
      !window.confirm(
        "この上程届を提出します。\n提出後は編集ロックされます（内容の変更には権限者による提出取り消しが必要）。\n\n提出しますか？"
      )
    )
      return;
    submitJotei(joteiId);
  };

  const onReopen = () => {
    if (!window.confirm("提出を取り消して編集可能に戻します。よろしいですか？")) return;
    reopenJotei(joteiId);
  };

  const onDelete = () => {
    if (!window.confirm("この上程届を削除します。元に戻せません。")) return;
    deleteJotei(joteiId);
    router.push(backHref);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={backHref} className={styles.navLink}>
          ← 上程届一覧
        </Link>
        <Link href={`/jotei/${joteiId}/view`} className={styles.navLink}>
          閲覧・印刷
        </Link>
        {!readOnly && can.submitGian && (
          <button type="button" className={styles.primaryBtn} onClick={onSubmit}>
            提出する
          </button>
        )}
        {!readOnly && (
          <button type="button" className={styles.delBtn} onClick={onDelete}>
            削除
          </button>
        )}
        {readOnly && member?.isMaster && (
          <button type="button" className={styles.ghostBtn} onClick={onReopen}>
            提出を取り消す
          </button>
        )}
        <span
          className={`${styles.badge} ${
            readOnly ? styles.badgeLocked : styles.badgeDraft
          }`}
        >
          {readOnly ? "提出済み（ロック）" : "下書き"}
        </span>
      </div>

      <div className={styles.card}>
        <div className={styles.crumb}>
          {found?.year.label} ／ {jotei.committeeName} ／ 上程届
        </div>

        {readOnly && (
          <p className={styles.lockNote}>
            提出済みのため編集できません。
            {jotei.submittedAt &&
              `（提出 ${new Date(jotei.submittedAt).toLocaleString("ja-JP")}）`}
          </p>
        )}

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>提出先の会議</span>
            <input
              className={styles.input}
              value={jotei.meetingName}
              placeholder="7月度定例理事会"
              list={listId}
              readOnly={readOnly}
              onChange={(e) => update({ meetingName: e.target.value })}
            />
            <datalist id={listId}>
              {meetingSuggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>提出日</span>
            <input
              type="date"
              className={styles.input}
              value={jotei.submissionDate}
              readOnly={readOnly}
              onChange={(e) => update({ submissionDate: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>提出者 役職</span>
            <input
              className={styles.input}
              value={jotei.submitterRole}
              placeholder="委員長"
              readOnly={readOnly}
              onChange={(e) => update({ submitterRole: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>提出者 氏名</span>
            <input
              className={styles.input}
              value={jotei.submitterName}
              placeholder="筒井 健太郎"
              readOnly={readOnly}
              onChange={(e) => update({ submitterName: e.target.value })}
            />
          </label>
        </div>

        {JOTEI_SECTIONS.map(({ key, label }) => {
          const items = sectionItems(jotei, key);
          return (
            <section key={key} className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>■{label}</h2>
                {!readOnly && (
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() =>
                      mutateSection(key, (arr) => [...arr, blankItem()])
                    }
                  >
                    ＋ 行を追加
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <p className={styles.emptyRow}>（項目なし）</p>
              ) : (
                <ol className={styles.rows}>
                  {items.map((it, i) => (
                    <li key={it.id} className={styles.row}>
                      <span className={styles.rowNo}>{i + 1}．</span>
                      <div className={styles.rowMain}>
                        <textarea
                          className={styles.rowInput}
                          rows={1}
                          value={it.title}
                          placeholder="項目名"
                          readOnly={readOnly}
                          onChange={(e) =>
                            mutateSection(key, (arr) =>
                              arr.map((x) =>
                                x.id === it.id
                                  ? { ...x, title: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                      {!readOnly && (
                        <div className={styles.rowBtns}>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            disabled={i === 0}
                            onClick={() =>
                              mutateSection(key, (arr) => {
                                const c = [...arr];
                                [c[i - 1], c[i]] = [c[i], c[i - 1]];
                                return c;
                              })
                            }
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            disabled={i === items.length - 1}
                            onClick={() =>
                              mutateSection(key, (arr) => {
                                const c = [...arr];
                                [c[i + 1], c[i]] = [c[i], c[i + 1]];
                                return c;
                              })
                            }
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className={styles.xBtn}
                            onClick={() =>
                              mutateSection(key, (arr) =>
                                arr.filter((x) => x.id !== it.id)
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
