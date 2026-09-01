-- ============================================================
-- RLS 本格化 v2 — permissions.ts の権限モデルを DB 側で強制する
--
--   方針:
--     - master は auth_is_master() で全許可に短絡 → ロックアウトなし
--     - SELECT は「認証済みなら全行」を維持（読みは壊さない）
--     - INSERT / UPDATE / DELETE のみ capability でゲート
--     - ロールは「割り当てのあるいずれかの年度で持っていれば可」で判定
--       （アプリの useEffectiveRole は選択中年度で判定するが、ここでは
--        締め出しを避けるため緩め＝「いずれかの年度」。年度スコープの
--        厳密化はローンチ後の課題）
--
--   ロールバックは同ファイル末尾の rollback セクション参照。
--   Supabase SQL Editor / scripts/db.mjs で実行。冪等。
-- ============================================================

-- ---- 既定権限マップ（src/lib/permissions.ts の DEFAULT_PERMS と一致させること）----
create or replace function public.default_perm(p_role text, p_cap text)
returns boolean language sql immutable as $$
  select case
    when p_role = 'master' then true
    when p_role in ('president','executive_director','secretary_general') then
      p_cap in ('editGian','submitGian','requestReplacement','approveReplacement',
                'createSidai','finalizeDistribution','editTemplates','editCommittees',
                'manageFixedFiles','editRoles')
    when p_role = 'vice_president' then
      p_cap in ('editGian','submitGian','requestReplacement','approveReplacement')
    when p_role in ('committee_chair','director') then
      p_cap in ('editGian','submitGian','requestReplacement')
    when p_role in ('auditor','committee_member') then
      p_cap = 'editGian'
    else false
  end;
$$;

create or replace function public.auth_is_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_master from public.members where id = auth.uid()), false);
$$;

-- 現在のユーザーが capability を持つか（master 短絡・override 優先・default_perm フォールバック）
create or replace function public.auth_has_cap(p_cap text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ov boolean;
  v_has_assignment boolean;
begin
  if v_uid is null then return false; end if;
  if public.auth_is_master() then return true; end if;

  select exists(select 1 from public.role_assignments where member_id = v_uid)
    into v_has_assignment;

  for v_role in
    select distinct role from public.role_assignments where member_id = v_uid
  loop
    select allowed into v_ov
      from public.role_perm_overrides where role = v_role and capability = p_cap;
    if v_ov is true then return true; end if;
    if v_ov is null and public.default_perm(v_role, p_cap) then return true; end if;
  end loop;

  -- 割当が無いユーザーは committee_member 扱い（アプリの roleOf() と同じ）
  if not v_has_assignment then
    select allowed into v_ov
      from public.role_perm_overrides where role = 'committee_member' and capability = p_cap;
    if v_ov is not null then return v_ov; end if;
    return public.default_perm('committee_member', p_cap);
  end if;

  return false;
end;
$$;

-- 明示 uid 版（route handler が service_role から呼ぶ。auth.uid() に依存しない）
create or replace function public.member_has_cap(p_uid uuid, p_cap text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_ov boolean;
  v_has_assignment boolean;
begin
  if p_uid is null then return false; end if;
  if coalesce((select is_master from public.members where id = p_uid), false) then
    return true;
  end if;

  select exists(select 1 from public.role_assignments where member_id = p_uid)
    into v_has_assignment;

  for v_role in
    select distinct role from public.role_assignments where member_id = p_uid
  loop
    select allowed into v_ov
      from public.role_perm_overrides where role = v_role and capability = p_cap;
    if v_ov is true then return true; end if;
    if v_ov is null and public.default_perm(v_role, p_cap) then return true; end if;
  end loop;

  if not v_has_assignment then
    select allowed into v_ov
      from public.role_perm_overrides where role = 'committee_member' and capability = p_cap;
    if v_ov is not null then return v_ov; end if;
    return public.default_perm('committee_member', p_cap);
  end if;

  return false;
end;
$$;

-- ============================================================
-- 書き込みポリシーを capability ベースに張り替え
-- （SELECT ポリシー *_sel はそのまま／members の扱いも据え置き）
-- ============================================================

-- gians / gian_snapshots ← editGian
drop policy if exists gians_write on public.gians;
create policy gians_write on public.gians for all to authenticated
  using (public.auth_has_cap('editGian'))
  with check (public.auth_has_cap('editGian'));

drop policy if exists gian_snapshots_write on public.gian_snapshots;
create policy gian_snapshots_write on public.gian_snapshots for all to authenticated
  using (public.auth_has_cap('editGian'))
  with check (public.auth_has_cap('editGian'));

-- replacement_requests ← requestReplacement / approveReplacement
drop policy if exists replacement_requests_write on public.replacement_requests;
create policy replacement_requests_write on public.replacement_requests for all to authenticated
  using (public.auth_has_cap('requestReplacement') or public.auth_has_cap('approveReplacement'))
  with check (public.auth_has_cap('requestReplacement') or public.auth_has_cap('approveReplacement'));

-- sidais ← createSidai
drop policy if exists sidais_write on public.sidais;
create policy sidais_write on public.sidais for all to authenticated
  using (public.auth_has_cap('createSidai'))
  with check (public.auth_has_cap('createSidai'));

-- distributions ← finalizeDistribution
drop policy if exists distributions_write on public.distributions;
create policy distributions_write on public.distributions for all to authenticated
  using (public.auth_has_cap('finalizeDistribution'))
  with check (public.auth_has_cap('finalizeDistribution'));

-- year_templates ← editTemplates
drop policy if exists year_templates_write on public.year_templates;
create policy year_templates_write on public.year_templates for all to authenticated
  using (public.auth_has_cap('editTemplates'))
  with check (public.auth_has_cap('editTemplates'));

-- committees ← editCommittees
drop policy if exists committees_write on public.committees;
create policy committees_write on public.committees for all to authenticated
  using (public.auth_has_cap('editCommittees'))
  with check (public.auth_has_cap('editCommittees'));

-- role_assignments / role_perm_overrides ← editRoles
drop policy if exists role_assignments_write on public.role_assignments;
create policy role_assignments_write on public.role_assignments for all to authenticated
  using (public.auth_has_cap('editRoles'))
  with check (public.auth_has_cap('editRoles'));

drop policy if exists role_perm_overrides_write on public.role_perm_overrides;
create policy role_perm_overrides_write on public.role_perm_overrides for all to authenticated
  using (public.auth_has_cap('editRoles'))
  with check (public.auth_has_cap('editRoles'));

-- fiscal_years ← createYear（既定は master のみ）
drop policy if exists fiscal_years_write on public.fiscal_years;
create policy fiscal_years_write on public.fiscal_years for all to authenticated
  using (public.auth_has_cap('createYear'))
  with check (public.auth_has_cap('createYear'));

-- file_objects ← editGian または manageFixedFiles
--   （dist scope の凍結コピーは /api/files/copy が service_role で行うため RLS 対象外）
drop policy if exists file_objects_write on public.file_objects;
create policy file_objects_write on public.file_objects for all to authenticated
  using (public.auth_has_cap('editGian') or public.auth_has_cap('manageFixedFiles'))
  with check (public.auth_has_cap('editGian') or public.auth_has_cap('manageFixedFiles'));

notify pgrst, 'reload schema';

-- ============================================================
-- ロールバック（緩い「認証済みなら全書き込み可」に戻す）
-- ============================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'fiscal_years','committees','role_assignments','role_perm_overrides',
--     'year_templates','gians','gian_snapshots','replacement_requests','sidais',
--     'distributions','file_objects'
--   ] loop
--     execute format('drop policy if exists %I on public.%I;', t||'_write', t);
--     execute format(
--       'create policy %I on public.%I for all to authenticated using (true) with check (true);',
--       t||'_write', t);
--   end loop;
-- end $$;
-- notify pgrst, 'reload schema';
