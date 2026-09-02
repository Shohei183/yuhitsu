-- ============================================================
-- 事業収支予算書（様式1＋明細様式2・3）テーブル
--   議案とは独立。gian_id で任意に紐づけ可。
-- ============================================================

create table if not exists public.budget_docs (
  id              text primary key,
  fiscal_year_id  text not null references public.fiscal_years(id) on delete cascade,
  gian_id         text references public.gians(id) on delete set null,
  title           text not null default '',
  doc             jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists budget_docs_year_idx on public.budget_docs(fiscal_year_id);
create index if not exists budget_docs_gian_idx on public.budget_docs(gian_id);

alter table public.budget_docs enable row level security;

drop policy if exists budget_docs_sel on public.budget_docs;
create policy budget_docs_sel on public.budget_docs
  for select to authenticated using (true);

-- 予算書の編集は議案の編集と同じ権限（editGian）
drop policy if exists budget_docs_write on public.budget_docs;
create policy budget_docs_write on public.budget_docs for all to authenticated
  using (public.auth_has_cap('editGian'))
  with check (public.auth_has_cap('editGian'));

notify pgrst, 'reload schema';
