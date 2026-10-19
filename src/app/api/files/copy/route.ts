import { NextResponse } from "next/server";
import { requireUser, hasCapability, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { copyObject, buildKey, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * POST /api/files/copy
 * body: { sourceIds: string[], destScope, destOwnerId, destGianId? }
 *  - destScope "dist"  … 配信確定時に、議案資料（gian scope）を確定時点の凍結コピーとして複製（要 finalizeDistribution）
 *  - destScope "gian"  … 議案の複製時に、資料（gian scope）を新しい議案へ複製（要 editGian）
 *  - destScope "budget"… 議案の複製時に、予算書の添付（budget scope）を新しい予算書へ複製（要 editGian）
 * いずれも R2 内でコピー。
 * → { files: [{ id, sourceId, name, size, mime, category, gianId }] }（呼び出し側が doc に記録）
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 未設定" }, { status: 503 });
  }

  let body: {
    sourceIds?: string[];
    destScope?: string;
    destOwnerId?: string;
    destGianId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const { sourceIds, destScope, destOwnerId, destGianId } = body;
  if (!Array.isArray(sourceIds) || !destScope || !destOwnerId) {
    return NextResponse.json({ error: "パラメータ不足" }, { status: 400 });
  }
  if (destScope !== "dist" && destScope !== "gian" && destScope !== "budget") {
    return NextResponse.json({ error: "不正なコピー先" }, { status: 400 });
  }
  const needCap = destScope === "dist" ? "finalizeDistribution" : "editGian";
  if (!(await hasCapability(auth.userId, needCap))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: sources, error } = await admin
    .from("file_objects")
    .select("*")
    .in("id", sourceIds);
  if (error) {
    return NextResponse.json({ error: "元ファイルの取得に失敗" }, { status: 500 });
  }

  const made: Array<Record<string, unknown>> = [];
  for (const src of sources ?? []) {
    // 議案・予算書への複製は、同じ種類（scope）のファイルだけ
    if (destScope !== "dist" && src.scope !== destScope) continue;
    const newId = `f-${crypto.randomUUID()}`;
    const newKey = buildKey(
      destScope as "dist" | "gian" | "budget",
      destOwnerId,
      newId,
      src.name as string
    );
    await copyObject(src.r2_key as string, newKey);
    const row = {
      id: newId,
      scope: destScope,
      owner_id: destOwnerId,
      gian_id:
        destScope === "gian"
          ? (destGianId ?? destOwnerId)
          : destScope === "dist"
            ? src.gian_id
            : null,
      category: src.category,
      name: src.name,
      size: src.size,
      mime: src.mime,
      r2_key: newKey,
    };
    await admin.from("file_objects").insert(row);
    made.push({
      id: newId,
      sourceId: src.id,
      name: src.name,
      size: src.size,
      mime: src.mime,
      category: src.category,
      gianId: src.gian_id,
    });
  }

  return NextResponse.json({ files: made });
}
