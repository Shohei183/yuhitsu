-- ============================================================
-- 議案レビューメモ（個人用・完全非公開）
--   配信された確定版議案に、本人だけが見える付箋（文字範囲アンカー付き）。
--   会議での発言用メモ。他人・議案担当・司会には一切見えない（RLS で強制）。
-- ============================================================

create table if not exists public.review_notes (
  id               text primary key,
  author_id        uuid not null references public.members(id) on delete cascade,
  distribution_id  text not null,
  gian_id          text not null,
  item_key         text not null default '',   -- アンカー項目キー（例 outline-2 / file-<id>）
  item_label       text not null default '',   -- 項目名のスナップショット（表示用）
  quote_exact      text not null default '',   -- 選択したテキスト
  quote_prefix     text not null default '',   -- 直前 ~30字（曖昧さ回避）
  quote_suffix     text not null default '',   -- 直後 ~30字
  body             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists review_notes_owner_idx
  on public.review_notes(author_id, distribution_id);

alter table public.review_notes enable row level security;

-- 本人の行だけ（select / insert / update / delete すべて）
drop policy if exists review_notes_own on public.review_notes;
create policy review_notes_own on public.review_notes for all to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

notify pgrst, 'reload schema';
