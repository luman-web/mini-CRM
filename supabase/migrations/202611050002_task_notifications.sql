-- Per-user task notifications with persistent read state.

create type public.notification_kind as enum (
  'assigned',
  'updated',
  'submitted',
  'revision',
  'accepted',
  'archived',
  'restored'
);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_id bigint not null references public.task_events(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  kind public.notification_kind not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_id)
);

create index notifications_recipient_created_at_idx
  on public.notifications(recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

create or replace function public.create_task_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_recipient uuid;
  v_kind public.notification_kind;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then return new; end if;

  if new.event_type = 'created' and v_task.assignee_id is not null then
    v_recipient := v_task.assignee_id;
    v_kind := 'assigned';
  elsif new.event_type = 'updated'
    and new.changes ? 'assignee_id'
    and v_task.assignee_id is not null then
    v_recipient := v_task.assignee_id;
    v_kind := 'assigned';
  elsif new.event_type = 'updated' and v_task.assignee_id is not null then
    v_recipient := v_task.assignee_id;
    v_kind := 'updated';
  elsif new.event_type = 'status_changed' and new.to_status = 'review' then
    v_recipient := v_task.author_id;
    v_kind := 'submitted';
  elsif new.event_type = 'status_changed' and new.to_status = 'revision' then
    v_recipient := v_task.assignee_id;
    v_kind := 'revision';
  elsif new.event_type = 'status_changed' and new.to_status = 'accepted' then
    v_recipient := v_task.assignee_id;
    v_kind := 'accepted';
  elsif new.event_type = 'archived' then
    v_recipient := v_task.assignee_id;
    v_kind := 'archived';
  elsif new.event_type = 'restored' then
    v_recipient := v_task.assignee_id;
    v_kind := 'restored';
  end if;

  if v_recipient is not null and v_recipient <> new.actor_id then
    insert into public.notifications (
      recipient_id, task_id, event_id, actor_id, kind, created_at
    ) values (
      v_recipient, new.task_id, new.id, new.actor_id, v_kind, new.created_at
    ) on conflict (recipient_id, event_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger task_events_create_notification
after insert on public.task_events
for each row execute function public.create_task_notification();

-- Give the demo accounts meaningful initial notifications without replaying
-- every historical event. New events are handled by the trigger above.
insert into public.notifications (
  recipient_id, task_id, event_id, actor_id, kind, created_at
)
select
  case
    when e.event_type = 'status_changed' and e.to_status = 'review' then t.author_id
    else t.assignee_id
  end,
  t.id,
  e.id,
  e.actor_id,
  case
    when e.event_type = 'created' then 'assigned'::public.notification_kind
    when e.event_type = 'status_changed' and e.to_status = 'review' then 'submitted'::public.notification_kind
    when e.event_type = 'status_changed' and e.to_status = 'revision' then 'revision'::public.notification_kind
    when e.event_type = 'status_changed' and e.to_status = 'accepted' then 'accepted'::public.notification_kind
    when e.event_type = 'archived' then 'archived'::public.notification_kind
  end,
  e.created_at
from public.task_events e
join public.tasks t on t.id = e.task_id
where (
    (e.event_type = 'created' and t.status = 'new' and t.assignee_id is not null)
    or (e.event_type = 'status_changed' and e.to_status in ('review', 'revision', 'accepted'))
    or e.event_type = 'archived'
  )
  and e.actor_id <> case
    when e.event_type = 'status_changed' and e.to_status = 'review' then t.author_id
    else t.assignee_id
  end
on conflict (recipient_id, event_id) do nothing;

alter table public.notifications enable row level security;

create policy notifications_read_own on public.notifications
for select to authenticated using (recipient_id = auth.uid());

create policy notifications_mark_own_read on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

revoke all on public.notifications from anon;
revoke insert, delete on public.notifications from authenticated;
grant select, update (read_at) on public.notifications to authenticated;

comment on table public.notifications is
  'Task notifications generated from the append-only task event log.';
