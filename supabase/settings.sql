-- ============================================================
-- アプリ設定（key-value）。当面は団体名（lom_name）のみ。
--   各 LOM のマスターが自分のデプロイの団体名を変更できるようにするため。
-- ============================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_sel on public.app_settings;
create policy app_settings_sel on public.app_settings
  for select to authenticated using (true);

-- 変更はマスターのみ
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all to authenticated
  using (public.auth_is_master())
  with check (public.auth_is_master());

notify pgrst, 'reload schema';
