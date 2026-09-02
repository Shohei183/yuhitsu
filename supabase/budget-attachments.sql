-- 費用明細の見積書添付：file_objects の scope に 'budget' を追加
alter table public.file_objects drop constraint if exists file_objects_scope_check;
alter table public.file_objects
  add constraint file_objects_scope_check
  check (scope in ('shared','gian','fixed','dist','budget'));

notify pgrst, 'reload schema';
