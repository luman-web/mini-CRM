-- Mini CRM: schema, workflow, audit history and database-enforced access.

create type public.app_role as enum ('setter', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'revision');
create type public.task_event_type as enum ('created', 'updated', 'status_changed', 'archived', 'restored');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  address text not null check (length(trim(address)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects(id) on delete restrict,
  title text not null check (length(trim(title)) between 2 and 200),
  description text not null default '',
  assignee_id uuid references public.profiles(id) on delete restrict,
  status public.task_status not null default 'new',
  author_id uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_archive_pair check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  )
);

create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type public.task_event_type not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status,
  comment text,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint task_events_status_shape check (
    (event_type = 'created' and from_status is null and to_status = 'new')
    or (event_type = 'status_changed' and from_status is not null and to_status is not null)
    or (event_type not in ('created', 'status_changed') and from_status is null and to_status is null)
  )
);

create index tasks_object_id_idx on public.tasks(object_id);
create index tasks_assignee_id_idx on public.tasks(assignee_id);
create index tasks_author_id_idx on public.tasks(author_id);
create index task_events_task_id_created_at_idx on public.task_events(task_id, created_at);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_setter()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() = 'setter', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger objects_set_updated_at
before update on public.objects
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.validate_task_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignee_role public.app_role;
  v_internal_action text := current_setting('app.task_internal_action', true);
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' or new.archived_at is not null or new.archived_by is not null then
      raise exception 'A task must be created active and in the new status';
    end if;
    if new.author_id <> auth.uid() then
      raise exception 'Task author must be the current user';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.author_id is distinct from old.author_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Task author and creation date are immutable';
    end if;

    if new.status is distinct from old.status then
      if v_internal_action <> 'transition' then
        raise exception 'Task status can only be changed with transition_task()';
      end if;
      if new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.object_id is distinct from old.object_id
        or new.assignee_id is distinct from old.assignee_id
        or new.archived_at is distinct from old.archived_at
        or new.archived_by is distinct from old.archived_by then
        raise exception 'Status transition cannot modify task fields';
      end if;
    elsif new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by then
      if v_internal_action not in ('archive', 'restore') then
        raise exception 'Use archive_task() or restore_task()';
      end if;
    else
      if old.status <> 'new' or old.archived_at is not null then
        raise exception 'Only an active new task can be edited';
      end if;
      if not public.is_setter() then
        raise exception 'Only a setter can edit a task';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if not public.is_setter() then
      raise exception 'Only a setter can delete a task';
    end if;
    if old.status <> 'new' or old.assignee_id is not null or old.archived_at is not null then
      raise exception 'Only an active, unassigned new task can be deleted';
    end if;
    return old;
  end if;

  if new.assignee_id is not null then
    select role into v_assignee_role from public.profiles where id = new.assignee_id;
    if v_assignee_role is distinct from 'executor' then
      raise exception 'Task assignee must have the executor role';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_validate_write
before insert or update or delete on public.tasks
for each row execute function public.validate_task_write();

create or replace function public.audit_task_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.task_events (
    task_id, event_type, actor_id, from_status, to_status, changes
  ) values (
    new.id,
    'created',
    new.author_id,
    null,
    'new',
    jsonb_build_object(
      'title', jsonb_build_object('old', null, 'new', new.title),
      'description', jsonb_build_object('old', null, 'new', new.description),
      'object_id', jsonb_build_object('old', null, 'new', new.object_id),
      'assignee_id', jsonb_build_object('old', null, 'new', new.assignee_id)
    )
  );
  return new;
end;
$$;

create trigger tasks_audit_insert
after insert on public.tasks
for each row execute function public.audit_task_insert();

create or replace function public.audit_task_edit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.status is distinct from old.status
    or new.archived_at is distinct from old.archived_at then
    return new;
  end if;

  if new.title is distinct from old.title then
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('old', old.title, 'new', new.title)
    );
  end if;
  if new.description is distinct from old.description then
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('old', old.description, 'new', new.description)
    );
  end if;
  if new.object_id is distinct from old.object_id then
    v_changes := v_changes || jsonb_build_object(
      'object_id', jsonb_build_object('old', old.object_id, 'new', new.object_id)
    );
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    v_changes := v_changes || jsonb_build_object(
      'assignee_id', jsonb_build_object('old', old.assignee_id, 'new', new.assignee_id)
    );
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.task_events (task_id, event_type, actor_id, changes)
    values (new.id, 'updated', auth.uid(), v_changes);
  end if;
  return new;
end;
$$;

create trigger tasks_audit_edit
after update on public.tasks
for each row execute function public.audit_task_edit();

create or replace function public.transition_task(
  p_task_id uuid,
  p_to_status public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_from_status public.task_status;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.archived_at is not null then raise exception 'Archived task cannot change status'; end if;

  v_from_status := v_task.status;
  if not (
    (v_from_status = 'new' and p_to_status = 'in_progress' and v_task.assignee_id = v_actor)
    or (v_from_status = 'in_progress' and p_to_status = 'review' and v_task.assignee_id = v_actor)
    or (v_from_status = 'review' and p_to_status = 'accepted' and v_task.author_id = v_actor)
    or (v_from_status = 'review' and p_to_status = 'revision' and v_task.author_id = v_actor
      and length(trim(coalesce(p_comment, ''))) > 0)
    or (v_from_status = 'revision' and p_to_status = 'in_progress' and v_task.assignee_id = v_actor)
  ) then
    raise exception 'Status transition is not allowed for this user';
  end if;

  perform set_config('app.task_internal_action', 'transition', true);
  update public.tasks set status = p_to_status where id = p_task_id returning * into v_task;
  perform set_config('app.task_internal_action', '', true);

  insert into public.task_events (
    task_id, event_type, actor_id, from_status, to_status, comment
  ) values (
    p_task_id, 'status_changed', v_actor, v_from_status, p_to_status, nullif(trim(p_comment), '')
  );
  return v_task;
end;
$$;

create or replace function public.archive_task(p_task_id uuid, p_comment text default null)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_actor uuid := auth.uid();
begin
  if not public.is_setter() then raise exception 'Only a setter can archive tasks'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.archived_at is not null then raise exception 'Task is already archived'; end if;

  perform set_config('app.task_internal_action', 'archive', true);
  update public.tasks set archived_at = now(), archived_by = v_actor
  where id = p_task_id returning * into v_task;
  perform set_config('app.task_internal_action', '', true);

  insert into public.task_events (task_id, event_type, actor_id, comment)
  values (p_task_id, 'archived', v_actor, nullif(trim(p_comment), ''));
  return v_task;
end;
$$;

create or replace function public.restore_task(p_task_id uuid, p_comment text default null)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_actor uuid := auth.uid();
begin
  if not public.is_setter() then raise exception 'Only a setter can restore tasks'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.archived_at is null then raise exception 'Task is not archived'; end if;

  perform set_config('app.task_internal_action', 'restore', true);
  update public.tasks set archived_at = null, archived_by = null
  where id = p_task_id returning * into v_task;
  perform set_config('app.task_internal_action', '', true);

  insert into public.task_events (task_id, event_type, actor_id, comment)
  values (p_task_id, 'restored', v_actor, nullif(trim(p_comment), ''));
  return v_task;
end;
$$;

create or replace function public.prevent_nonempty_object_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.tasks where object_id = old.id) then
    raise exception 'An object with tasks cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger objects_prevent_nonempty_delete
before delete on public.objects
for each row execute function public.prevent_nonempty_object_delete();

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

create policy profiles_read_authenticated on public.profiles
for select to authenticated using (true);

create policy objects_read_allowed on public.objects
for select to authenticated using (
  public.is_setter()
  or exists (
    select 1 from public.tasks t
    where t.object_id = objects.id and t.assignee_id = auth.uid()
  )
);
create policy objects_insert_setter on public.objects
for insert to authenticated with check (public.is_setter() and created_by = auth.uid());
create policy objects_update_setter on public.objects
for update to authenticated using (public.is_setter()) with check (public.is_setter());
create policy objects_delete_setter on public.objects
for delete to authenticated using (public.is_setter());

create policy tasks_read_allowed on public.tasks
for select to authenticated using (public.is_setter() or assignee_id = auth.uid());
create policy tasks_insert_setter on public.tasks
for insert to authenticated with check (public.is_setter() and author_id = auth.uid());
create policy tasks_update_setter on public.tasks
for update to authenticated using (public.is_setter()) with check (public.is_setter());
create policy tasks_delete_setter on public.tasks
for delete to authenticated using (public.is_setter());

create policy task_events_read_allowed on public.task_events
for select to authenticated using (
  exists (
    select 1 from public.tasks t
    where t.id = task_events.task_id
      and (public.is_setter() or t.assignee_id = auth.uid())
  )
);

revoke all on public.profiles, public.objects, public.tasks, public.task_events from anon;
revoke insert, update, delete on public.task_events from authenticated;
grant select on public.profiles, public.task_events to authenticated;
grant select, insert, update, delete on public.objects, public.tasks to authenticated;

revoke all on function public.transition_task(uuid, public.task_status, text) from public, anon;
revoke all on function public.archive_task(uuid, text) from public, anon;
revoke all on function public.restore_task(uuid, text) from public, anon;
grant execute on function public.transition_task(uuid, public.task_status, text) to authenticated;
grant execute on function public.archive_task(uuid, text) to authenticated;
grant execute on function public.restore_task(uuid, text) to authenticated;

comment on table public.task_events is
  'Append-only audit log. Direct INSERT/UPDATE/DELETE is unavailable to API users.';
comment on column public.tasks.archived_at is
  'Archiving is separate from the workflow status and preserves task history.';
