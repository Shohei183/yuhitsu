"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createJotei, listJoteiForCommittee } from "@/lib/joteiStore";
import { useJoteiStore } from "@/lib/useJoteiStore";
import { useCommittee, useAuthMember, useCan } from "@/lib/useOrg";
import { formatJaDate } from "@/lib/format";
import styles from "./JoteiList.module.css";

export default function JoteiCommitteeList({
  committeeId,
}: {
  committeeId: string;
}) {
  const router = useRouter();
  const found = useCommittee(committeeId);
  useJoteiStore();
  const member = useAuthMember();
  const can = useCan();

  if (!found) {
    return (
      <main className={styles.wrap}>
        <p className={styles.notFound}>委員会が見つかりません。</p>
        <Link href="/" className={styles.back}>
          ← トップへ
        </Link>
      </main>
    );
  }

  const { year, committee } = found;
  const list = listJoteiForCommittee(committeeId);

  const onCreate = () => {
    const id = createJotei({
      yearId: year.id,
      committeeId,
      committeeName: committee.name,
      submitterName: member?.name ?? "",
      submitterRole: "委員長",
    });
    router.push(`/jotei/${id}`);
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year.label} ／ {committee.name} ／ 上程届
        </div>
        <h1 className={styles.title}>上程届</h1>
        <p className={styles.note}>
          会議ごとに提出する上程届の作成・一覧です。提出すると内容がロックされます。
        </p>
        <Link href={`/committee/${committeeId}`} className={styles.back}>
          ← {committee.name}
        </Link>
      </div>

      {can.editGian && (
        <div className={styles.createRow}>
          <button type="button" className={styles.createBtn} onClick={onCreate}>
            ＋ 新規の上程届を作成
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className={styles.empty}>まだ上程届がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((j) => (
            <li key={j.id} className={styles.item}>
              <Link
                href={
                  j.status === "submitted"
                    ? `/jotei/${j.id}/view`
                    : `/jotei/${j.id}`
                }
                className={styles.itemMain}
              >
                <span
                  className={`${styles.statusTag} ${
                    j.status === "submitted" ? styles.locked : styles.draft
                  }`}
                >
                  {j.status === "submitted" ? "提出済み" : "下書き"}
                </span>
                <span className={styles.itemTitle}>
                  {j.meetingName || "（会議名未設定）"}
                </span>
                <span className={styles.itemCount}>
                  協議{j.kyogi.length}／審議{j.shingi.length}／報告
                  {j.houkoku.length}
                </span>
              </Link>
              <div className={styles.itemActions}>
                <Link href={`/jotei/${j.id}/view`} className={styles.viewLink}>
                  閲覧
                </Link>
                {j.status !== "submitted" && can.editGian && (
                  <Link href={`/jotei/${j.id}`} className={styles.viewLink}>
                    編集
                  </Link>
                )}
                <span className={styles.itemDate}>
                  {j.status === "submitted" && j.submittedAt
                    ? `提出 ${formatJaDate(j.submittedAt)}`
                    : `更新 ${formatJaDate(j.updatedAt)}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
