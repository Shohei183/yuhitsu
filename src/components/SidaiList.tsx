"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSidai, duplicateSidai, listSidaiFor } from "@/lib/sidaiStore";
import { listDistributionsFor } from "@/lib/distributionStore";
import { PERIOD_LABEL, Period } from "@/lib/yearStore";
import { setPeriod } from "@/lib/activeViewStore";
import { useSidaiStore } from "@/lib/useSidaiStore";
import { useDistributionStore } from "@/lib/useDistributionStore";
import { useActiveView, useActiveYear, useCan } from "@/lib/useOrg";
import styles from "@/app/page.module.css";

const PERIODS: Period[] = ["planned", "live"];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SidaiList() {
  useSidaiStore(); // ストア変更で再描画
  useDistributionStore();
  const router = useRouter();
  const { yearId, period } = useActiveView();
  const year = useActiveYear();
  const can = useCan();

  const scope = `${year?.label ?? yearId} ／ ${PERIOD_LABEL[period]}`;
  const dists = listDistributionsFor(yearId, period);

  const periodTabs = (
    <div className={styles.toolbar}>
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={p === period ? styles.toolBtnPrimary : styles.toolBtn}
          onClick={() => setPeriod(p)}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  );

  // ── 編集権限なし：配信データ（確定済み）のみ表示 ──
  if (!can.createSidai) {
    return (
      <>
        <div className={styles.head}>
          <div className={styles.crumb}>年度フォルダ ／ 配信 ／ 配信データ</div>
          <h1 className={styles.title}>配信データ一覧</h1>
        </div>
        <p className={styles.note}>
          配信確定された次第（配信データ）を閲覧できます。次第の作成・編集には
          「次第の作成・複製」権限が必要です（マスターが /roles で設定）。
          <br />
          対象：<strong>{scope}</strong>
        </p>

        {periodTabs}

        <div className={styles.toolbar}>
          <Link href="/" className={styles.navLink}>
            ← トップへ
          </Link>
        </div>

        {dists.length === 0 ? (
          <p className={styles.note}>
            この年度・期間の配信データはまだありません。
          </p>
        ) : (
          <ul className={styles.list}>
            {dists.map((d) => (
              <li key={d.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.kind}>配信データ</span>
                  <span className={styles.meta}>
                    {d.board}／{d.occurrence}
                  </span>
                </div>
                <Link href={`/haishin/${d.id}`} className={styles.topicLink}>
                  {d.name}_v{d.version}
                </Link>
                <div className={styles.meta}>
                  確定日時：{fmt(d.finalizedAt)}　／　収録議案 {d.gians.length} 件
                </div>
                <div className={styles.cardActions}>
                  <Link href={`/haishin/${d.id}`} className={styles.navLink}>
                    配信データを開く
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  // ── 編集権限あり：次第の一覧＋作成 ──
  const items = listSidaiFor(yearId, period);
  const newest = items[0];

  return (
    <>
      <div className={styles.head}>
        <div className={styles.crumb}>年度フォルダ ／ 配信 ／ 次第作成</div>
        <h1 className={styles.title}>次第一覧</h1>
      </div>
      <p className={styles.note}>
        会議の進行表（次第）を作成します。行を追加・並び替えし、右のパレットから
        上程済み議案を紐づけます。状態はブラウザに保存されます。
        <br />
        対象：<strong>{scope}</strong> の配信フォルダ
      </p>

      {periodTabs}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolBtnPrimary}
          onClick={() => router.push(`/sidai/${createSidai({ yearId, period })}`)}
        >
          ＋ 新規作成
        </button>
        {newest && (
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => {
              const id = duplicateSidai(newest.id);
              if (id) router.push(`/sidai/${id}`);
            }}
          >
            前回の次第を複製して作成
          </button>
        )}
        <Link href="/" className={styles.navLink}>
          ← トップへ
        </Link>
      </div>

      {items.length === 0 ? (
        <p className={styles.note}>
          この年度・期間の次第はまだありません。「＋ 新規作成」で追加してください。
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((s) => (
            <li key={s.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.kind}>次第</span>
                <span className={styles.meta}>{s.rows.length}行</span>
              </div>
              <Link href={`/sidai/${s.id}/view`} className={styles.topicLink}>
                {s.meetingName}
              </Link>
              <div className={styles.meta}>{s.datetime || "日時未設定"}</div>
              <div className={styles.cardActions}>
                <Link href={`/sidai/${s.id}/view`} className={styles.navLink}>
                  閲覧
                </Link>
                <Link href={`/sidai/${s.id}`} className={styles.navLink}>
                  編集
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
