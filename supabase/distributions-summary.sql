-- ============================================================
-- 配信データの一覧用サマリ
--   起動時は doc（次第・収録議案の凍結コピー）を読まず、この列だけを取得する。
--   { "gianIds": [...収録議案 id], "reportIds": [...収録委員会報告 id] }
--   ※ 列がまだ無い環境でもアプリは動く（doc を読む従来の方式に自動で戻る）。
-- ============================================================
alter table public.distributions add column if not exists summary jsonb;

update public.distributions d set summary = jsonb_build_object(
  'gianIds', coalesce((select jsonb_agg(g->>'id') from jsonb_array_elements(d.doc->'gians') g), '[]'::jsonb),
  'reportIds', coalesce((select jsonb_agg(r->>'id') from jsonb_array_elements(coalesce(d.doc->'reports', '[]'::jsonb)) r), '[]'::jsonb)
)
where summary is null;
