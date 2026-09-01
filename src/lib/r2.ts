import "server-only";

// ─────────────────────────────────────────────────────────────
// Cloudflare R2（S3互換）ヘルパー — route handler 専用
//
// aws4fetch で署名付き URL を発行する。ファイル実体はブラウザ ⇄ R2 を
// 直接やりとりし、Next.js のサーバーは通さない（転送コスト・実行時間の節約）。
// ─────────────────────────────────────────────────────────────

import { AwsClient } from "aws4fetch";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || "yuhitsu-files";

function endpoint(): string {
  if (!accountId) throw new Error("R2_ACCOUNT_ID 未設定");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

let awsClient: AwsClient | null = null;
function aws(): AwsClient {
  if (awsClient) return awsClient;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 の認証情報が未設定です（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）");
  }
  awsClient = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return awsClient;
}

export function r2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey);
}

function objectUrl(key: string): string {
  return `${endpoint()}/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
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
    headers: { "x-amz-copy-source": `/${bucket}/${srcKey}` },
  });
  if (!res.ok) throw new Error(`R2 複製失敗: ${res.status}`);
}

/** 決定論的なオブジェクトキー */
export function buildKey(
  scope: "shared" | "gian" | "fixed" | "dist",
  ownerId: string,
  fileId: string,
  name: string
): string {
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  return `${scope}/${ownerId}/${fileId}${ext}`;
}
