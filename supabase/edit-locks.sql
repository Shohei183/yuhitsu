-- ============================================================
-- 編集ロック（共同編集）
--   - fiscal_years.collab_enabled : 年度ごとのスイッチ。オンの年度の議案・上程届・予算書・委員会報告だけ、
--     アプリが編集ロックを取る（オフの年度は従来どおり）。
--   - edit_locks : 誰がどの文書を編集中か（1文書につき1行）。書き込みは下の関数だけから。
--   - enforce_edit_lock : 他の人が（90秒以内に）編集中の文書への UPDATE/DELETE を DB が拒否する。
--       ロックの行が無い／期限切れ／本人のとき、service_role のときは従来どおり通る。
--   Supabase SQL Editor / scripts/db.mjs で実行。冪等。
-- ============================================================

alter table public.fiscal_years
  add column if not exists collab_enabled boolean not null default false;

create table if not exists public.edit_locks (
  doc_type     text not null check (doc_type in ('gian','jotei','budget','report')),
  doc_id       text not null,
  member_id    uuid not null references public.members(id) on delete cascade,
  member_name  text not null default '',
  session_id   text not null,                     -- 画面（タブ）ごとの id
  acquired_at  timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  primary key (doc_type, doc_id)
);

alter table public.edit_locks enable row level security;

drop policy if exists edit_locks_sel on public.edit_locks;
create policy edit_locks_sel on public.edit_locks
  for select to authenticated using (true);
-- 書き込みポリシーは作らない（下の security definer 関数だけが書く）

-- ロックを取る。空いている／期限切れ（最終確認から90秒超）／同じ画面なら取れる。
create or replace function public.acquire_edit_lock(p_type text, p_id text, p_session text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_holder record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if not public.auth_has_cap('editGian') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1))
    into v_name from public.members where id = v_uid;

  insert into public.edit_locks as l (doc_type, doc_id, member_id, member_name, session_id)
  values (p_type, p_id, v_uid, coalesce(v_name, ''), p_session)
  on conflict (doc_type, doc_id) do update
    set member_id    = excluded.member_id,
        member_name  = excluded.member_name,
        session_id   = excluded.session_id,
        acquired_at  = case when l.session_id = excluded.session_id then l.acquired_at else now() end,
        heartbeat_at = now()
    where l.session_id = excluded.session_id
       or l.heartbeat_at < now() - interval '90 seconds';

  if found then
    return jsonb_build_object('ok', true);
  end if;

  select member_name, member_id, acquired_at into v_holder
    from public.edit_locks where doc_type = p_type and doc_id = p_id;
  return jsonb_build_object(
    'ok', false,
    'holder', coalesce(v_holder.member_name, ''),
    'own', v_holder.member_id = v_uid,
    'since', v_holder.acquired_at
  );
end;
$$;

-- 編集中であることを知らせ続ける（約30秒ごと）。ロックを失っていれば false。
create or replace function public.refresh_edit_lock(p_type text, p_id text, p_session text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  update public.edit_locks set heartbeat_at = now()
   where doc_type = p_type and doc_id = p_id
     and session_id = p_session and member_id = auth.uid();
  return found;
end;
$$;

-- ロックを手放す（保存して終了／画面を離れるとき）
create or replace function public.release_edit_lock(p_type text, p_id text, p_session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.edit_locks
   where doc_type = p_type and doc_id = p_id
     and session_id = p_session and member_id = auth.uid();
end;
$$;

-- マスターだけ、他の人のロックを強制的に外せる
create or replace function public.force_release_edit_lock(p_type text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.auth_is_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.edit_locks where doc_type = p_type and doc_id = p_id;
end;
$$;

revoke execute on function public.acquire_edit_lock(text, text, text) from public, anon;
revoke execute on function public.refresh_edit_lock(text, text, text) from public, anon;
revoke execute on function public.release_edit_lock(text, text, text) from public, anon;
revoke execute on function public.force_release_edit_lock(text, text) from public, anon;
grant execute on function public.acquire_edit_lock(text, text, text) to authenticated;
grant execute on function public.refresh_edit_lock(text, text, text) to authenticated;
grant execute on function public.release_edit_lock(text, text, text) to authenticated;
grant execute on function public.force_release_edit_lock(text, text) to authenticated;

-- 他の人が編集中の文書への UPDATE / DELETE を拒否する
create or replace function public.enforce_edit_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_id text;
  v_lock public.edit_locks;
begin
  if auth.uid() is not null then
    v_type := case tg_table_name
      when 'gians' then 'gian'
      when 'jotei_todokes' then 'jotei'
      when 'budget_docs' then 'budget'
      when 'committee_reports' then 'report'
    end;
    v_id := case when tg_op = 'DELETE' then old.id else new.id end;
    select * into v_lock from public.edit_locks where doc_type = v_type and doc_id = v_id;
    if found
       and v_lock.member_id <> auth.uid()
       and v_lock.heartbeat_at > now() - interval '90 seconds' then
      raise exception 'edit_locked: %', v_lock.member_name using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists enforce_edit_lock_gians on public.gians;
create trigger enforce_edit_lock_gians
  before update or delete on public.gians
  for each row execute function public.enforce_edit_lock();

drop trigger if exists enforce_edit_lock_jotei on public.jotei_todokes;
create trigger enforce_edit_lock_jotei
  before update or delete on public.jotei_todokes
  for each row execute function public.enforce_edit_lock();

drop trigger if exists enforce_edit_lock_budget on public.budget_docs;
create trigger enforce_edit_lock_budget
  before update or delete on public.budget_docs
  for each row execute function public.enforce_edit_lock();

drop trigger if exists enforce_edit_lock_report on public.committee_reports;
create trigger enforce_edit_lock_report
  before update or delete on public.committee_reports
  for each row execute function public.enforce_edit_lock();

notify pgrst, 'reload schema';
