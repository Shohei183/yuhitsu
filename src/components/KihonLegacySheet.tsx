"use client";

import { Fragment } from "react";
import { KihonLegacy, splitRoleLines } from "@/lib/kihonLegacy";
import { RICH_RED } from "@/lib/richText";
import styles from "./KihonLegacySheet.module.css";

/**
 * 基本方針の「従来様式」（原本の Word 様式に合わせた1枚の表）。
 * 画面には出さず、印刷（PDF）のときだけ表示する（親の CSS で切り替える）。
 */
export default function KihonLegacySheet({ data }: { data: KihonLegacy }) {
  const col = (lines: KihonLegacy["income"]) =>
    lines.length === 0 ? (
      <div className={styles.line}>&nbsp;</div>
    ) : (
      lines.map((l, i) => (
        <div key={i} className={`${styles.line} ${styles.moneyLine}`}>
          <span>{l.label}</span>
          <span className={styles.amount}>{l.amount}</span>
        </div>
      ))
    );

  return (
    <div className={styles.sheet}>
      <div className={styles.title}>{data.title}</div>
      {data.chair && <div className={styles.chair}>{data.chair}</div>}

      <table className={styles.table}>
        <colgroup>
          <col style={{ width: "14.9%" }} />
          <col style={{ width: "42.4%" }} />
          <col style={{ width: "42.7%" }} />
        </colgroup>
        <tbody>
          {/* 担当 ／ 配属メンバー */}
          <tr>
            <td className={styles.label}>
              <div className={styles.line}>担当</div>
              {data.leads.map((p, i) => (
                <Fragment key={i}>
                  {splitRoleLines(p.role).map((r, j) => (
                    <div key={j} className={styles.line}>
                      {r}
                    </div>
                  ))}
                  <div className={styles.line}>{p.name}</div>
                </Fragment>
              ))}
            </td>
            <td colSpan={2}>
              {data.members.map((p, i) => (
                <div key={i} className={styles.line}>
                  {p.role}　{p.name}
                </div>
              ))}
            </td>
          </tr>

          {/* 基本方針の本文 */}
          <tr>
            <td className={styles.label} />
            <td colSpan={2}>
              {data.policy.map((para, i) => (
                <div key={i} className={`${styles.line} ${styles.indent}`}>
                  {para.length === 0
                    ? " "
                    : para.map((r, j) => (
                        <span
                          key={j}
                          style={r.red ? { color: RICH_RED } : undefined}
                        >
                          {r.text}
                        </span>
                      ))}
                </div>
              ))}
            </td>
          </tr>

          {/* 事業計画の一覧 */}
          <tr>
            <td className={styles.label} />
            <td colSpan={2}>
              {data.plans.map((t, i) => (
                <div key={i} className={styles.line}>
                  {t}
                </div>
              ))}
            </td>
          </tr>

          {/* 事業予定 */}
          <tr>
            <td className={styles.label} />
            <td colSpan={2}>
              {data.schedule.map((t, i) => (
                <div key={i} className={styles.line}>
                  {t}
                </div>
              ))}
            </td>
          </tr>

          {/* 委員会予算 */}
          <tr>
            <td className={`${styles.label} ${styles.budgetLabel}`} rowSpan={3}>
              委員会予算
            </td>
            <td className={styles.center}>収　入　の　部</td>
            <td className={styles.center}>支　出　の　部</td>
          </tr>
          <tr>
            <td className={styles.items}>{col(data.income)}</td>
            <td className={styles.items}>{col(data.expense)}</td>
          </tr>
          <tr>
            <td className={`${styles.line} ${styles.total}`}>
              合計　{data.incomeTotal}
            </td>
            <td className={`${styles.line} ${styles.total}`}>
              合計　{data.expenseTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
