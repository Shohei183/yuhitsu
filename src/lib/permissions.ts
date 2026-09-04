// ─────────────────────────────────────────────────────────────
// ロール × 操作権限の定義と既定値
//
// 要件定義書 3.11 / 6.：「ロールごとの操作権限の具体的な洗い出し」は今後の検討事項。
// ここではプロトタイプとして、ロールごとに「何ができるか」をチェックボックスで
// 編集できるようにする（マスターのみ /roles 画面で操作）。
// ─────────────────────────────────────────────────────────────

import { Role, SELECTABLE_ROLES } from "./yearStore";

export type Capability =
  | "editGian" // 議案の編集（同時編集）
  | "submitGian" // 会議へ上程
  | "requestReplacement" // 差し替え申請
  | "approveReplacement" // 差し替え申請の承認・差し戻し
  | "createSidai" // 次第の作成・複製
  | "finalizeDistribution" // 配信確定・再配信確定
  | "editTemplates" // 議案・次第テンプレートの編集
  | "editCommittees" // 委員会フォルダの追加・リネーム
  | "manageFixedFiles" // 固定ファイルの登録・更新
  | "editRoles" // メンバー権限（年度ロール）の割当
  | "manageMembers" // メンバー管理（アカウント発行・退会）
  | "createYear"; // 年度フォルダの新規作成

export interface CapabilityDef {
  key: Capability;
  label: string;
  desc: string;
  /** その権限が実際に画面のボタン表示制御へ反映されているか */
  enforced: boolean;
}

/** 画面に並べる順の権限一覧 */
export const CAPABILITIES: CapabilityDef[] = [
  {
    key: "editGian",
    label: "議案の編集・新規作成",
    desc: "議案構築エリアで議案を新規作成し、テンプレートの中身を編集する",
    enforced: true,
  },
  {
    key: "submitGian",
    label: "会議へ上程",
    desc: "その時点の議案・資料を確定し「上程済み」にする",
    enforced: true,
  },
  {
    key: "requestReplacement",
    label: "差し替え申請",
    desc: "上程済み議案の差し替えを配信データ作成者へ申請する",
    enforced: true,
  },
  {
    key: "approveReplacement",
    label: "差し替え申請の承認・差し戻し",
    desc: "他の委員会から出た差し替え申請を承認／却下する",
    enforced: true,
  },
  {
    key: "createSidai",
    label: "次第の作成・複製",
    desc: "会議の次第（進行表）を新規作成・複製する",
    enforced: true,
  },
  {
    key: "finalizeDistribution",
    label: "配信確定・再配信確定",
    desc: "次第と収録議案・資料一式を配信フォルダへ確定コピーする",
    enforced: true,
  },
  {
    key: "editTemplates",
    label: "議案・次第テンプレートの編集",
    desc: "テンプレートの項目名の変更・追加・削除・並び替え",
    enforced: true,
  },
  {
    key: "editCommittees",
    label: "委員会フォルダの編集",
    desc: "年度フォルダ内の委員会の追加・名称変更",
    enforced: true,
  },
  {
    key: "manageFixedFiles",
    label: "固定ファイルの登録・更新",
    desc: "年度フォルダの固定ファイル（規約・テンプレート等）を追加・削除する",
    enforced: true,
  },
  {
    key: "editRoles",
    label: "メンバー権限（年度ロール）の割当",
    desc: "この年度における各メンバーのロールを割り当てる",
    enforced: true,
  },
  {
    key: "manageMembers",
    label: "メンバー管理（アカウント発行・退会）",
    desc: "LOM 全体のアカウントを発行・退会処理する",
    enforced: true,
  },
  {
    key: "createYear",
    label: "年度フォルダの新規作成",
    desc: "次年度フォルダを作成する",
    enforced: false,
  },
];

export const CAPABILITY_KEYS: Capability[] = CAPABILITIES.map((c) => c.key);

/** マスター以外の、権限を編集できるロール */
export const EDITABLE_ROLES: Role[] = SELECTABLE_ROLES;

function caps(list: Capability[]): Record<Capability, boolean> {
  const out = {} as Record<Capability, boolean>;
  for (const k of CAPABILITY_KEYS) out[k] = list.includes(k);
  return out;
}

/** 議案の作成〜配信までひととおり回せる officer 権限（メンバー管理・年度作成を除く） */
const OFFICER_CAPS: Capability[] = [
  "editGian",
  "submitGian",
  "requestReplacement",
  "approveReplacement",
  "createSidai",
  "finalizeDistribution",
  "editTemplates",
  "editCommittees",
  "manageFixedFiles",
  "editRoles",
];

/** ロールごとの既定権限（/roles で未変更ならこれが使われる） */
export const DEFAULT_PERMS: Record<Role, Record<Capability, boolean>> = {
  master: caps(CAPABILITY_KEYS), // すべて許可（編集不可）
  president: caps(OFFICER_CAPS),
  past_president: caps(["editGian", "submitGian", "requestReplacement"]),
  executive_director: caps(OFFICER_CAPS),
  secretary_general: caps(OFFICER_CAPS),
  vice_president: caps([
    "editGian",
    "submitGian",
    "requestReplacement",
    "approveReplacement",
  ]),
  auditor: caps(["editGian"]),
  committee_chair: caps(["editGian", "submitGian", "requestReplacement"]),
  director: caps(["editGian", "submitGian", "requestReplacement"]),
  committee_member: caps(["editGian"]),
};
