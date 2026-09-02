import "server-only";

// ─────────────────────────────────────────────────────────────
// Cloudflare R2（S3互換）ヘルパー — route handler 専用
//
// aws4fetch で署名付き URL を発行する。ファイル実体はブラウザ ⇄ R2 を
// 直接やりとりし、Next.js のサーバーは通さない（転送コスト・実行時間の節約）。
//
// ⚠️ 環境変数はモジュール先頭ではなく関数内で読む。Cloudflare Workers では
//    env がリクエストごとに注入されるため、起動時点では未定義になる。
// ─────────────────────────────────────────────────────────────

import { AwsClient } from "aws4fetch";

function accountId(): string | undefined {
  return process.env.R2_ACCOUNT_ID;
}
function accessKeyId(): string | undefined {
  return process.env.R2_ACCESS_KEY_ID;
}
function secretAccessKey(): string | undefined {
  return process.env.R2_SECRET_ACCESS_KEY;
}
function bucket(): string {
  return process.env.R2_BUCKET || "yuhitsu-files";
}

function endpoint(): string {
  const id = accountId();
  if (!id) throw new Error("R2_ACCOUNT_ID 未設定");
  return `https://${id}.r2.cloudflarestorage.com`;
}

function aws(): AwsClient {
  const ak = accessKeyId();
  const sk = secretAccessKey();
  if (!ak || !sk) {
    throw new Error("R2 の認証情報が未設定です（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）");
  }
  // AwsClient は軽量。リクエストごとに作っても問題ない。
  return new AwsClient({
    accessKeyId: ak,
    secretAccessKey: sk,
    service: "s3",
    region: "auto",
  });
}

export function r2Configured(): boolean {
  return Boolean(accountId() && accessKeyId() && secretAccessKey());
}

function objectUrl(key: string): string {
  return `${endpoint()}/${bucket()}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

/** アップロード用の署名付き PUT URL */
export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 600
): Promise<string> {
  const signed = await aws().sign(
    `${objectUrl(key)}?X-Amz-Expires=${expiresIn}`,
    { method: "PUT", headers: { "content-type": contentType }, aws: { signQuery: true } }
  );
  return signed.url;
}

/** 閲覧・ダウンロード用の署名付き GET URL。downloadName 指定で Content-Disposition attachment */
export async function presignGet(
  key: string,
  expiresIn = 600,
  downloadName?: string
): Promise<string> {
  let u = `${objectUrl(key)}?X-Amz-Expires=${expiresIn}`;
  if (downloadName) {
    const cd = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
    u += `&response-content-disposition=${encodeURIComponent(cd)}`;
  }
  const signed = await aws().sign(u, { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** R2 上のオブジェクトを削除 */
export async function deleteObject(key: string): Promise<void> {
  const res = await aws().fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 削除失敗: ${res.status}`);
  }
}

/** R2 内でオブジェクトを複製（配信確定時の凍結コピー用） */
export async function copyObject(srcKey: string, destKey: string): Promise<void> {
  const res = await aws().fetch(objectUrl(destKey), {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${bucket()}/${srcKey}` },
  });
  if (!res.ok) throw new Error(`R2 複製失敗: ${res.status}`);
}

/** 決定論的なオブジェクトキー */
export function buildKey(
  scope: "shared" | "gian" | "fixed" | "dist" | "budget",
  ownerId: string,
  fileId: string,
  name: string
): string {
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  return `${scope}/${ownerId}/${fileId}${ext}`;
}
