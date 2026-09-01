"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GianKind, MOCK_GIANS, STATUS_LABEL } from "@/lib/mockData";
import { createGian, deleteGian, duplicateGian } from "@/lib/gianStore";
import { useCommittee, useCan } from "@/lib/useOrg";
import { useGianStore } from "@/lib/useGianStore";
import styles from "./CommitteeFolder.module.css";

const KINDS: GianKind[] = ["協議", "審議", "決算協議", "決算審議", "基本方針"];

const KIND_CLASS: Record<GianKind, string> = {
  協議: styles.kindKyogi,
  審議: styles.kindShingi,
  決算協議: styles.kindKessanKyogi,
  決算審議: styles.kindKessanShingi,
  基本方針: styles.kindKihon,
};

export default function CommitteeGianList({
  committeeId,
}: {
  committeeId: string;
}) {
  const found = useCommittee(committeeId);
  const gianStore = useGianStore();
  const can = useCan();
  const router = useRouter();

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

  const onCreate = (kind: GianKind) => {
    const id = createGian({
      yearId: year.id,
      committee: committee.name,
      committeeId,
      kind,
    });
    router.push(`/gian/${id}`);
  };

  const onDelete = (id: string) => {
    if (!confirm("この下書き議案を削除します。よろしいですか？")) return;
    deleteGian(id);
  };

  const onDuplicate = (id: string, targetKind?: GianKind) => {
    const newId = duplicateGian(id, targetKind);
    if (newId) router.push(`/gian/${newId}`);
  };

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year.label} ／ 委員会 ／ {committee.name} ／ 議案構築
        </div>
        <h1 className={styles.title}>{committee.name}｜議案構築</h1>
        <p className={styles.note}>
          この委員会の議案一覧です。議案を開くと、テンプレート反映・資料一覧・上程フロー付きの
          議案構築画面に遷移します。
        </p>
        <Link href={`/committee/${committeeId}`} className={styles.back}>
          ← 委員会フォルダ
        </Link>
      </div>

      {can.editGian ? (
        <div className={styles.createRow}>
          <span className={styles.createLabel}>＋ 新規作成：</span>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={styles.createBtn}
              onClick={() => onCreate(k)}
            >
              {k === "基本方針" ? "基本方針" : `${k}議案`}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.note}>
          議案の新規作成には「議案の編集・新規作成」権限が必要です（マスターが /roles で設定）。
        </p>
      )}

      {gians.length === 0 ? (
        <p className={styles.empty}>まだ議案がありません。</p>
      ) : (
        <ul className={styles.gianList}>
          {gians.map((g) => (
            <li key={g.id} className={styles.gianItem}>
              <Link href={`/gian/${g.id}`} className={styles.gianMain}>
                <span className={`${styles.kindTag} ${KIND_CLASS[g.kind]}`}>
                  {g.kind === "基本方針" ? "基本方針" : `${g.kind}議案`}
                </span>
                <span className={styles.gianTopic}>{g.topic}</span>
                <span className={`${styles.statusTag} ${styles[g.status]}`}>
                  {STATUS_LABEL[g.status]}
                </span>
              </Link>
              <span className={styles.gianActions}>
                <Link href={`/gian/${g.id}/view`} className={styles.viewLink}>
                  閲覧
                </Link>
                {can.editGian && (
                  <>
                    <button
                      type="button"
                      className={styles.dupBtn}
                      onClick={() => onDuplicate(g.id)}
                    >
                      複製
                    </button>
                    {g.kind === "協議" && (
                      <button
                        type="button"
                        className={styles.dupBtn}
                        onClick={() => onDuplicate(g.id, "審議")}
                      >
                        審議へ複製
                      </button>
                    )}
                    {g.kind === "決算協議" && (
                      <button
                        type="button"
                        className={styles.dupBtn}
                        onClick={() => onDuplicate(g.id, "決算審議")}
                      >
                        決算審議へ複製
                      </button>
                    )}
                  </>
                )}
                {g.status === "editing" &&
                  !MOCK_GIANS.some((m) => m.id === g.id) && (
                    <button
                      type="button"
                      className={styles.delBtn}
                      onClick={() => onDelete(g.id)}
                    >
                      削除
                    </button>
                  )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
