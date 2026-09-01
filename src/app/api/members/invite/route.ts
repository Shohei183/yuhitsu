import { NextResponse } from "next/server";
import { requireUser, isMaster, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/members/invite   （master のみ）
 * body: { email, fullName }
 * Supabase Auth に招待メールを送る。members 行はトリガで自動作成される。
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await isMaster(auth.userId))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { email?: string; fullName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.fullName ?? "").trim();
  if (!email) return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });

  const admin = getSupabaseAdmin();

  const redirectTo =
    (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "") + "/login/set-password";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: redirectTo || undefined,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 念のため members 行の氏名を更新（トリガより後に反映される場合がある）
  if (data.user) {
    await admin
      .from("members")
      .update({ full_name: fullName })
      .eq("id", data.user.id);
  }

  return NextResponse.json({ ok: true });
}
