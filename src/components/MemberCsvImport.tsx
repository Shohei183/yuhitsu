"use client";

import { useState } from "react";
import {
  getMemberByEmail,
  hydrate as hydrateMembers,
  inviteOne,
} from "@/lib/memberStore";
import { ROLE_LABEL, setAssignment } from "@/lib/yearStore";
import {
  useActiveView,
  useActiveYear,
  useAuthMember,
  useCan,
  useMemberStore,
} from "@/lib/useOrg";
import {
  ParsedMemberRow,
  parseMembersCsv,
  readCsvFile,
} from "@/lib/memberCsv";
import styles from "./MemberAdmin.module.css";

const SAMPLE = [
  "名前,役職,メール",
  "田中 太郎,委員長,tanaka@example.com",
  "鈴木 花子,委員,suzuki@example.com",
  "佐藤 次郎,,sato@example.com",
].join("\n");

type RowResult = { email: string; name: string; ok: boolean; msg: string };

export default function MemberCsvImport() {
  useMemberStore();
  const { yearId } = useActiveView();
  const year = useActiveYear();
  const me = useAuthMember();
  const can = useCan();
  const canAssignRoles = !!me?.isMaster || can.editRoles;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedMemberRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RowResult[] | null>(null);

  const parse = (t: string) => {
    setText(t);
    setResults(null);
    setRows(t.trim() ? parseMembersCsv(t) : null);
  };

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    parse(await readCsvFile(f));
  };

  const decorated = (rows ?? []).map((r) => ({
    ...r,
    dupExisting: !!(r.email && getMemberByEmail(r.email)),
  }));
  const sendable = decorated.filter(
    (r) => r.errors.length === 0 && !r.dupExisting
  );
  const skipCount = decorated.length - sendable.length;

  const run = async () => {
    if (!yearId || sendable.length === 0 || running) return;
    if (
      !window.confirm(
        `${sendable.length} 件を招待します（1件ずつ送信）。\n` +
          `Supabase の1時間あたりの送信上限（既定30通）を超えた分は失敗として表示されます。\n` +
          `大人数の場合は事前に Supabase → Authentication → Rate Limits で上限を上げてください。\n\n実行しますか？`
      )
    )
      return;

    setRunning(true);
    setProgress({ done: 0, total: sendable.length });
    const out: RowResult[] = [];
    for (const r of sendable) {
      try {
        const inv = await inviteOne({ name: r.name, email: r.email });
        if (!inv.ok) {
          out.push({
            email: r.email,
            name: r.name,
            ok: false,
            msg: inv.error ?? "送信失敗",
          });
        } else {
          const assign = r.role && inv.userId && canAssignRoles;
          if (assign) {
            await setAssignment(yearId, inv.userId!, r.role!);
          }
          out.push({
            email: r.email,
            name: r.name,
            ok: true,
            msg: assign
              ? `招待送信 ／ ${year?.label ?? ""}のロール＝${ROLE_LABEL[r.role!]}`
              : r.role && !canAssignRoles
                ? "招待送信（ロール割当は権限なし）"
                : "招待送信",
          });
        }
      } catch (e) {
        out.push({
          email: r.email,
          name: r.name,
          ok: false,
          msg: e instanceof Error ? e.message : "エラー",
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setResults([...out]);
      await new Promise((res) => setTimeout(res, 700));
    }
    await hydrateMembers();
    setRunning(false);
  };

  if (!open) {
    return (
      <div className={styles.issue}>
        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => setOpen(true)}
        >
          ＋ CSVで一括登録・一斉招待
        </button>
      </div>
    );
  }

  return (
    <div className={styles.issue}>
      <div className={styles.issueTitle}>
        CSVで一括登録・一斉招待
        <button
          type="button"
          className={styles.rowBtn}
          style={{ marginLeft: 10 }}
          onClick={() => setOpen(false)}
        >
          閉じる
        </button>
      </div>

      <p className={styles.note}>
        列は <strong>名前, 役職, メール</strong> の順。1行1名。役職は空でも可（招待だけ）。
        役職を入れると <strong>{year?.label ?? yearId}</strong> のロールとして割り当てます。
        「マスター」はここでは割り当てられません（発行後に個別付与）。
        Excel の CSV（Shift-JIS）もそのまま読めます。
      </p>

      <div className={styles.csvTools}>
        <label className={styles.rowBtn} style={{ cursor: "pointer" }}>
          ファイルを選択
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/plain"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => parse(SAMPLE)}
        >
          サンプルを入れる
        </button>
      </div>

      <textarea
        className={styles.csvArea}
        rows={6}
        placeholder={"名前,役職,メール\n山田 太郎,委員長,yamada@example.com"}
        value={text}
        onChange={(e) => parse(e.target.value)}
      />

      {rows && rows.length > 0 && (
        <>
          <div className={styles.csvStat}>
            {decorated.length} 行 ／ 送信可能 <strong>{sendable.length}</strong>
            {skipCount > 0 && <span>　スキップ {skipCount}</span>}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>役職</th>
                  <th>メール</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {decorated.map((r) => {
                  const ng = r.errors.length > 0;
                  return (
                    <tr key={r.line}>
                      <td>{r.name || <span className={styles.dim}>—</span>}</td>
                      <td>
                        {r.role
                          ? ROLE_LABEL[r.role]
                          : r.isMasterLabel
                            ? "（マスターはスキップ）"
                            : r.roleLabel || <span className={styles.dim}>—</span>}
                      </td>
                      <td>{r.email || <span className={styles.dim}>—</span>}</td>
                      <td>
                        {ng ? (
                          <span className={styles.csvNg}>{r.errors.join("／")}</span>
                        ) : r.dupExisting ? (
                          <span className={styles.dim}>登録済み（スキップ）</span>
                        ) : (
                          <span className={styles.csvOk}>送信可能</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.csvTools}>
            <button
              type="button"
              className={styles.issueBtn}
              disabled={running || sendable.length === 0}
              onClick={run}
            >
              {running
                ? `送信中… ${progress.done}/${progress.total}`
                : `${sendable.length} 件を招待して送信`}
            </button>
          </div>
        </>
      )}

      {results && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>名前</th>
                <th>メール</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>
                    <span className={r.ok ? styles.csvOk : styles.csvNg}>
                      {r.ok ? "✓ " : "✗ "}
                      {r.msg}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
