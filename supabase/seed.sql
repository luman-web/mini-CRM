-- Compact, idempotent demo data.
-- Prerequisite: at least one setter and one executor in public.profiles.
-- The script never deletes or updates existing user data.

do $$
declare
  v_setter_id uuid;
  v_executor_1_id uuid;
  v_executor_2_id uuid;
  v_object_id uuid;
begin
  select id into v_setter_id
  from public.profiles
  where role = 'setter'
  order by created_at
  limit 1;

  select id into v_executor_1_id
  from public.profiles
  where role = 'executor'
  order by created_at
  limit 1;

  select id into v_executor_2_id
  from public.profiles
  where role = 'executor'
  order by created_at
  offset 1
  limit 1;

  if v_setter_id is null or v_executor_1_id is null then
    raise exception 'Seed requires at least one setter and one executor in public.profiles';
  end if;

  v_executor_2_id := coalesce(v_executor_2_id, v_executor_1_id);

  -- Database triggers use auth.uid(), so the seed acts as the selected setter.
  perform set_config('request.jwt.claim.sub', v_setter_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select id into v_object_id
  from public.objects
  where name = 'ЖК Северный (демо)'
    and created_by = v_setter_id
  order by created_at
  limit 1;

  if v_object_id is null then
    insert into public.objects (name, address, created_by)
    values ('ЖК Северный (демо)', 'ул. Строителей, 10', v_setter_id)
    returning id into v_object_id;
  end if;

  insert into public.tasks (object_id, title, description, assignee_id, author_id)
  select v_object_id, 'Проверить фундамент',
    'Проверить геометрию и приложить фотографии.', v_executor_1_id, v_setter_id
  where not exists (
    select 1 from public.tasks
    where object_id = v_object_id and title = 'Проверить фундамент'
  );

  insert into public.tasks (object_id, title, description, assignee_id, author_id)
  select v_object_id, 'Провести фотофиксацию фасада',
    'Сделать общий план и фотографии замечаний.', v_executor_2_id, v_setter_id
  where not exists (
    select 1 from public.tasks
    where object_id = v_object_id and title = 'Провести фотофиксацию фасада'
  );

  insert into public.tasks (object_id, title, description, assignee_id, author_id)
  select v_object_id, 'Подготовить акт осмотра',
    'Сформировать акт после назначения исполнителя.', null, v_setter_id
  where not exists (
    select 1 from public.tasks
    where object_id = v_object_id and title = 'Подготовить акт осмотра'
  );
end
$$;
