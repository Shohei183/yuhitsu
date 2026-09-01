"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TemplateItem,
  TemplateList,
  addItem,
  isTemplateCustomized,
  moveItem,
  removeItem,
  renameItem,
  resetTemplate,
} from "@/lib/templateStore";
import { useTemplate } from "@/lib/useTemplateStore";
import { useActiveView, useActiveYear, useAuthMember, useCan } from "@/lib/useOrg";
import styles from "./TemplateAdmin.module.css";

type Tab =
  | "kyogi"
  | "shingi"
  | "kessanKyogi"
  | "kessanShingi"
  | "kihon"
  | "sidai";

const TAB_LABEL: Record<Tab, string> = {
  kyogi: "協議",
  shingi: "審議",
  kessanKyogi: "決算協議",
  kessanShingi: "決算審議",
  kihon: "基本方針",
  sidai: "次第",
};
const TABS: Tab[] = [
  "kyogi",
  "shingi",
  "kessanKyogi",
  "kessanShingi",
  "kihon",
  "sidai",
];

export default function TemplateAdmin() {
  const me = useAuthMember();
  const { yearId } = useActiveView();
  const year = useActiveYear();
  const tpl = useTemplate(yearId);
  const can = useCan();
  const [tab, setTab] = useState<Tab>("kyogi");

  if (!me) return null;

  const canEdit = can.editTemplates;
  const customized = isTemplateCustomized(yearId);

  return (
    <main className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.crumb}>
          {year?.label ?? yearId} ／ 議案・次第テンプレート
        </div>
        <h1 className={styles.title}>議案・次第テンプレート</h1>
        <p className={styles.note}>
          {canEdit
            ? "テンプレートの項目名の変更・追加・削除・並び替えができます。"
            : "閲覧のみ（編集は「議案・次第テンプレートの編集」権限を持つロール）。"}
          {" "}協議／審議／決算協議／決算審議は別々に管理します。新規議案・新規次第の作成時にこの型が使われます。
          年度タブで対象年度を切り替えられます。
        </p>
        <div className={styles.headRow}>
          <Link href="/" className={styles.back}>
            ← トップへ
          </Link>
          {canEdit && customized && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                if (confirm(`${year?.label ?? yearId} のテンプレートを既定に戻します。`)) {
                  resetTemplate(yearId);
                }
              }}
            >
              この年度のテンプレートを既定に戻す
            </button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "kyogi" && (
        <>
          <ItemListEditor
            yearId={yearId}
            list="kyogiOutline"
            title="事業要綱"
            hint="番号は自動。議案作成者はこの項目の中身を肉付けします。"
            items={tpl.kyogi.outline}
            canEdit={canEdit}
            numberStyle="1."
          />
          <ItemListEditor
            yearId={yearId}
            list="kyogiOverview"
            title="事業概要"
            hint="「実施までのスケジュール」の項目は日付／内容の表として編集されます。"
            items={tpl.kyogi.overview}
            canEdit={canEdit}
            numberStyle="1."
          />
        </>
      )}

      {tab === "shingi" && (
        <>
          <p className={styles.subNote}>
            審議議案には「前回までの流れ（意見と対応）」は表示されません。
          </p>
          <ItemListEditor
            yearId={yearId}
            list="shingiOutline"
            title="事業要綱"
            hint="番号は自動。議案作成者はこの項目の中身を肉付けします。"
            items={tpl.shingi.outline}
            canEdit={canEdit}
            numberStyle="1."
          />
          <ItemListEditor
            yearId={yearId}
            list="shingiOverview"
            title="事業概要"
            hint="「実施までのスケジュール」の項目は日付／内容の表として編集されます。"
            items={tpl.shingi.overview}
            canEdit={canEdit}
            numberStyle="1."
          />
        </>
      )}

      {tab === "kessanKyogi" && (
        <>
          <p className={styles.subNote}>
            決算議案（協議）。「前回までの流れ（意見と対応）」を表示します。
          </p>
          <ItemListEditor
            yearId={yearId}
            list="kessanKyogiOutline"
            title="事業要綱"
            hint="番号は自動。議案作成者はこの項目の中身を肉付けします。"
            items={tpl.kessanKyogi.outline}
            canEdit={canEdit}
            numberStyle="1."
          />
          <ItemListEditor
            yearId={yearId}
            list="kessanKyogiOverview"
            title="事業概要"
            hint="決算額・予算差異など決算特有の項目を追加できます。"
            items={tpl.kessanKyogi.overview}
            canEdit={canEdit}
            numberStyle="1."
          />
        </>
      )}

      {tab === "kessanShingi" && (
        <>
          <p className={styles.subNote}>
            決算議案（審議）。「前回までの流れ」は表示されません。
          </p>
          <ItemListEditor
            yearId={yearId}
            list="kessanShingiOutline"
            title="事業要綱"
            hint="番号は自動。議案作成者はこの項目の中身を肉付けします。"
            items={tpl.kessanShingi.outline}
            canEdit={canEdit}
            numberStyle="1."
          />
          <ItemListEditor
            yearId={yearId}
            list="kessanShingiOverview"
            title="事業概要"
            hint="決算額・予算差異など決算特有の項目を追加できます。"
            items={tpl.kessanShingi.overview}
            canEdit={canEdit}
            numberStyle="1."
          />
        </>
      )}

      {tab === "kihon" && (
        <>
          <p className={styles.subNote}>
            基本方針（事務局事業計画など）。「前回までの流れ（意見と対応）」を同一画面で記入・表示でき、
            審議可決後の外部配信前にワンクリックで削除できます。事業計画の各項目からは個別の議案へリンクを張れます。
          </p>
          <ItemListEditor
            yearId={yearId}
            list="kihonOutline"
            title="基本方針（本文）"
            hint="本文の見出し。通常は「基本方針」1 項目。"
            items={tpl.kihon.outline}
            canEdit={canEdit}
            numberStyle="1."
          />
          <ItemListEditor
            yearId={yearId}
            list="kihonOverview"
            title="事業計画"
            hint="事業計画の各項目。議案作成画面で項目ごとに別議案へのリンクを設定できます。"
            items={tpl.kihon.overview}
            canEdit={canEdit}
            numberStyle="1."
          />
        </>
      )}

      {tab === "sidai" && (
        <ItemListEditor
          yearId={yearId}
          list="sidaiSections"
          title="次第の区分（見出し）"
          hint="新規次第を作成すると、この並びで区分見出しが入ります。"
          items={tpl.sidaiSections}
          canEdit={canEdit}
          numberStyle="＝"
        />
      )}
    </main>
  );
}

function ItemListEditor({
  yearId,
  list,
  title,
  hint,
  items,
  canEdit,
  numberStyle,
}: {
  yearId: string;
  list: TemplateList;
  title: string;
  hint: string;
  items: TemplateItem[];
  canEdit: boolean;
  numberStyle: "1." | "＝";
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>
          {title}
          <span className={styles.count}>{items.length} 項目</span>
        </span>
        <span className={styles.panelHint}>{hint}</span>
      </div>

      <ol className={styles.list}>
        {items.map((it, i) => (
          <li key={it.id} className={styles.row}>
            <span className={styles.rowNo}>
              {numberStyle === "1." ? `${i + 1}.` : "＝"}
            </span>
            <input
              className={styles.rowInput}
              value={it.label}
              placeholder="項目名"
              disabled={!canEdit}
              onChange={(e) => renameItem(yearId, list, it.id, e.target.value)}
            />
            {canEdit && (
              <span className={styles.rowCtrls}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="上へ"
                  disabled={i === 0}
                  onClick={() => moveItem(yearId, list, it.id, "up")}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="下へ"
                  disabled={i === items.length - 1}
                  onClick={() => moveItem(yearId, list, it.id, "down")}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="削除"
                  onClick={() => removeItem(yearId, list, it.id)}
                >
                  ×
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => addItem(yearId, list)}
        >
          ＋ 項目を追加
        </button>
      )}
    </section>
  );
}
