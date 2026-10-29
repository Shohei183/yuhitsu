"use client";

import Link from "next/link";
import { useGianStore } from "@/lib/useGianStore";
import { useDistributionStore } from "@/lib/useDistributionStore";
import { useActiveView, useActiveYear } from "@/lib/useOrg";
import { setPeriod } from "@/lib/activeViewStore";
import { PERIOD_LABEL, Period } from "@/lib/yearStore";
import { Gian, STATUS_LABEL } from "@/lib/mockData";
import { gianMetaLine } from "@/lib/gianMeta";
import type { GianEntry } from "@/lib/gianStore";
import { formatJaDateTime } from "@/lib/format";
import styles from "./JoteiFiles.module.css";

const PERIODS: Period[] = ["planned", "live"];

interface FolderGian {
  gian: Gian;
  /** 配信データに収録された議案ならその配信データ（確定時点のコピーを開く） */
  distId: string | null;
  /** 収録されていなくても、そのフォルダ（会議）の配信データ（コメント用に引き継ぐ） */
  folderDistId: string | null;
}
interface Folder {
  key: string;
  title: string;
  /** 配信確定済みの会議なら、その最新版 */
  dist: {
    id: string;
    version: number;
    finalizedAt: string;
    board: string;
  } | null;
  byCommittee: { committee: string; items: FolderGian[] }[];
  count: number;
}

function kindLabel(g: Gian): string {
  return g.kind === "基本方針" ? "基本方針" : `${g.kind}議案`;
}
function sortKey(g: Gian): string {
  return g.submittedAt ?? g.updatedAt ?? "";
}

/**
 * 上程した日時。submittedAt が無い古い議案は、上程時のスナップショットから補う。
 */
function submittedAtOf(e: GianEntry): string | null {
  if (e.gian.submittedAt) return e.gian.submittedAt;
  const subs = e.snapshots.filter(
    (s) => s.kind === "submission" && s.reason.startsWith("会議へ上程")
  );
  return subs.length ? subs[subs.length - 1].takenAt : null;
}

/**
 * 上程ファイル：会議（配信）ごとのフォルダに、各委員会から上程された議案を委員会別に集約する。
 *  - 前回の配信以降に上程された議案 → 「上程中」フォルダ（次の配信待ち）
 *  - 配信確定すると、その会議のフォルダとして確定し、新しい「上程中」フォルダが始まる
 * フォルダは上程日時と配信確定日時から自動で決まる（手作業の振り分けは不要）。
 */
export default function JoteiFiles() {
  const year = useActiveYear();
  const { period } = useActiveView();
  const gianStore = useGianStore();
  const distStore = useDistributionStore();

  const yearId = year?.id ?? "";

  // この年度・期間の配信を会議ごとにまとめ、確定の古い順に並べる
  const dists = Object.values(distStore).filter(
    (p) => p.yearId === yearId && p.period === period
  );
  const meetingMap = new Map<
    string,
    { key: string; board: string; occurrence: string; versions: typeof dists }
  >();
  for (const d of dists) {
    const key = `${d.board}／${d.occurrence}`;
    if (!meetingMap.has(key)) {
      meetingMap.set(key, {
        key,
        board: d.board,
        occurrence: d.occurrence,
        versions: [],
      });
    }
    meetingMap.get(key)!.versions.push(d);
  }
  const meetings = [...meetingMap.values()].map((m) => {
    const sorted = [...m.versions].sort(
      (a, b) =>
        b.version - a.version || b.finalizedAt.localeCompare(a.finalizedAt)
    );
    const endAt = m.versions.reduce(
      (mx, p) => (p.finalizedAt > mx ? p.finalizedAt : mx),
      ""
    );
    const ids = new Set(m.versions.flatMap((p) => p.gians.map((g) => g.id)));
    return { ...m, versions: sorted, latest: sorted[0], endAt, ids };
  });
  meetings.sort((a, b) => a.endAt.localeCompare(b.endAt)); // 古い順

  // 議案を各フォルダへ振り分け
  const buckets = new Map<string, FolderGian[]>(); // meeting.key or "__current"
  const put = (key: string, fg: FolderGian) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(fg);
  };
  const lastEnd = meetings.length ? meetings[meetings.length - 1].endAt : "";
  for (const e of Object.values(gianStore)) {
    const g = e.gian;
    if (g.yearId !== yearId || g.status === "editing") continue;

    // 次第から直接リンクされて配信データに収録された議案
    const inMeeting = meetings.find((m) => m.ids.has(g.id));
    if (inMeeting) {
      put(inMeeting.key, {
        gian: g,
        distId: inMeeting.latest.id,
        folderDistId: inMeeting.latest.id,
      });
      continue;
    }
    // 収録されていない議案（議案内のリンク先など）も、上程した時期の会議フォルダへ。
    // 前回の配信以降に上程されたものだけが「上程中」に残る。
    const at = submittedAtOf(e);
    if (!at || at > lastEnd) {
      put("__current", { gian: g, distId: null, folderDistId: null });
      continue;
    }
    let prevEnd = "";
    let placed = false;
    for (const m of meetings) {
      if (at > prevEnd && at <= m.endAt) {
        put(m.key, { gian: g, distId: null, folderDistId: m.latest.id });
        placed = true;
        break;
      }
      prevEnd = m.endAt;
    }
    if (!placed) {
      put("__current", { gian: g, distId: null, folderDistId: null });
    }
  }

  const toFolder = (
    key: string,
    title: string,
    dist: Folder["dist"]
  ): Folder => {
    const items = buckets.get(key) ?? [];
    const byC = new Map<string, FolderGian[]>();
    for (const it of items) {
      const c = it.gian.committee || "（委員会未設定）";
      if (!byC.has(c)) byC.set(c, []);
      byC.get(c)!.push(it);
    }
    const byCommittee = [...byC.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ja"))
      .map(([committee, its]) => ({
        committee,
        items: its.sort((x, y) =>
          sortKey(y.gian).localeCompare(sortKey(x.gian))
        ),
      }));
    return { key, title, dist, byCommittee, count: items.length };
  };

  const current = toFolder("__current", "上程中（次の配信待ち）", null);
  const past = [...meetings].reverse().map((m) =>
    toFolder(m.key, m.occurrence, {
      id: m.latest.id,
      version: m.latest.version,
      finalizedAt: m.latest.finalizedAt,
      board: m.board,
    })
  );

  const renderCommittees = (f: Folder) =>
    f.byCommittee.length === 0 ? (
      <p className={styles.empty}>この期間に上程された議案はありません。</p>
    ) : (
      <div className={styles.committees}>
        {f.byCommittee.map((c) => (
          <div key={c.committee} className={styles.committee}>
            <div className={styles.committeeName}>
              📁 {c.committee}
              <span className={styles.count}>{c.items.length}件</span>
            </div>
            <ul className={styles.gianList}>
              {c.items.map(({ gian, distId, folderDistId }) => (
                <li key={gian.id} className={styles.gianRow}>
                  <span className={styles.kind}>{kindLabel(gian)}</span>
                  <span className={styles.gianMain}>
                    <Link prefetch={false}
                      href={
                        distId
                          ? `/haishin/${distId}/gian/${gian.id}`
                          : `/gian/${gian.id}/view${
                              folderDistId ? `?dist=${folderDistId}` : ""
                            }`
                      }
                      className={styles.gianLink}
                    >
                      {gian.topic}
                    </Link>
                    <span className={styles.gianSub}>{gianMetaLine(gian)}</span>
                  </span>
                  <span
                    className={`${styles.state} ${
                      distId ? styles.stateDone : ""
                    }`}
                  >
                    {distId
                      ? "配信済み"
                      : f.dist
                        ? "上程済み"
                        : STATUS_LABEL[gian.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>{year?.label} ／ 上程ファイル</div>
        <h1 className={styles.title}>上程ファイル</h1>
        <p className={styles.note}>
          各委員会から上程された議案が、会議ごとのフォルダに委員会別でまとまります。
          配信すると、次第から直接リンクされた議案だけでなく、その時点で上程されていたすべての議案（議案内リンクの参照先を含む）が会議フォルダへ移ります。
          <br />
          上程 → 「上程中」フォルダに委員会ごとに並ぶ → 配信確定 →
          その会議のフォルダとして確定し、新しい「上程中」フォルダが始まります。
        </p>
        <div className={styles.tabs}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={p === period ? styles.tabOn : styles.tab}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <Link prefetch={false} href="/" className={styles.back}>
          ← トップへ
        </Link>
      </div>

      <details className={styles.folder} open>
        <summary className={styles.folderHead}>
          <span className={styles.folderIcon}>📂</span>
          <span className={styles.folderTitle}>{current.title}</span>
          <span className={styles.count}>{current.count}件</span>
        </summary>
        <div className={styles.folderBody}>{renderCommittees(current)}</div>
      </details>

      {past.map((f) => (
        <details key={f.key} className={styles.folder}>
          <summary className={styles.folderHead}>
            <span className={styles.folderIcon}>📁</span>
            <span className={styles.folderTitle}>{f.title}</span>
            <span className={styles.folderMeta}>
              {f.dist?.board}
              {f.dist &&
                `　最新 v${f.dist.version}（${formatJaDateTime(f.dist.finalizedAt)}）`}
            </span>
            <span className={styles.count}>{f.count}件</span>
          </summary>
          <div className={styles.folderBody}>
            {f.dist && (
              <Link prefetch={false} href={`/haishin/${f.dist.id}`} className={styles.distLink}>
                この会議の配信データを開く →
              </Link>
            )}
            {renderCommittees(f)}
          </div>
        </details>
      ))}
    </main>
  );
}
