"use client";

import Link from "next/link";
import { STATUS_LABEL } from "@/lib/mockData";
import { useCommittee } from "@/lib/useOrg";
import { useGianStore } from "@/lib/useGianStore";
import { useSharedFiles } from "@/lib/useSharedStore";
import styles from "./CommitteeFolder.module.css";

export default function CommitteeFolder({
  committeeId,
}: {
  committeeId: string;
}) {
  const found = useCommittee(committeeId);
  const gianStore = useGianStore();
  const { files: sharedFiles } = useSharedFiles(committeeId);

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
  const gians = committee.gianIds
    .map((id) => gianStore[id]?.gian)
    .filter((g): g is NonNullable<typeof g> => !!g);
  const byStatus = {
    editing: gians.filter((g) => g.status === "editing").length,
    submitted: gians.filter((g) => g.status === "submitted").length,
    locked: gians.filter((g) => g.status === "locked").length,
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year.label} ／ 委員会 ／ {committee.name}
        </div>
        <h1 className={styles.title}>{committee.name}</h1>
        <Link href="/" className={styles.back}>
          ← 年度フォルダへ
        </Link>
      </div>

      <div className={styles.cards}>
        <Link
          href={`/committee/${committeeId}/gian`}
          className={styles.folderCard}
        >
          <div className={styles.folderIcon}>📁</div>
          <div className={styles.folderBody}>
            <div className={styles.folderName}>議案構築</div>
            <div className={styles.folderDesc}>
              協議・審議・決算議案の作成エリア。テンプレート・資料一覧・上程フローつき。
            </div>
            <div className={styles.folderMeta}>
              議案 {gians.length} 件
              {gians.length > 0 && (
                <>
                  （{STATUS_LABEL.editing} {byStatus.editing} ／{" "}
                  {STATUS_LABEL.submitted} {byStatus.submitted} ／{" "}
                  {STATUS_LABEL.locked} {byStatus.locked}）
                </>
              )}
            </div>
          </div>
          <div className={styles.folderArrow}>→</div>
        </Link>

        <Link
          href={`/committee/${committeeId}/shared`}
          className={styles.folderCard}
        >
          <div className={styles.folderIcon}>📁</div>
          <div className={styles.folderBody}>
            <div className={styles.folderName}>共有用フォルダ</div>
            <div className={styles.folderDesc}>
              出欠確認表・議案化前の下書きなどを自由に置ける場所（議案システムの管理対象外）。
            </div>
            <div className={styles.folderMeta}>ファイル {sharedFiles.length} 件</div>
          </div>
          <div className={styles.folderArrow}>→</div>
        </Link>
      </div>
    </main>
  );
}
