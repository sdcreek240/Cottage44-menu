create table public.plate_assignment_history (
  id bigint generated always as identity primary key,
  service_date date not null,
  event_type text not null check (
    event_type in ('assigned', 'changed', 'cleared', 'plate_deleted', 'backfilled')
  ),
  previous_plate jsonb check (
    previous_plate is null or jsonb_typeof(previous_plate) = 'object'
  ),
  current_plate jsonb check (
    current_plate is null or jsonb_typeof(current_plate) = 'object'
  ),
  occurred_at timestamptz not null default now(),
  actor_email text
);

alter table public.plate_assignment_history enable row level security;
revoke all on table public.plate_assignment_history from anon, authenticated;
grant select on table public.plate_assignment_history to authenticated;

create policy plate_assignment_history_owner_read
on public.plate_assignment_history
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create function public.plate_assignment_snapshot(plate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', plates.id,
    'name', plates.name,
    'description', plates.description,
    'price_cents', plates.price_cents,
    'image_url', plates.image_url
  )
  from public.plates
  where plates.id = plate_id;
$$;

revoke all on function public.plate_assignment_snapshot(uuid)
  from public, anon, authenticated;

create function public.record_daily_plate_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_snapshot jsonb;
  current_snapshot jsonb;
  event_kind text;
begin
  if tg_op = 'INSERT' then
    current_snapshot := public.plate_assignment_snapshot(new.plate_id);
    insert into public.plate_assignment_history (
      service_date, event_type, current_plate, actor_email
    ) values (
      new.service_date, 'assigned', current_snapshot,
      nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.plate_id is not distinct from new.plate_id then
      return new;
    end if;

    if new.plate_id is null then
      select case
        when current_plate ->> 'id' = old.plate_id::text then current_plate
        else previous_plate
      end
      into previous_snapshot
      from public.plate_assignment_history
      where service_date = new.service_date
        and (
          current_plate ->> 'id' = old.plate_id::text
          or previous_plate ->> 'id' = old.plate_id::text
        )
      order by id desc
      limit 1;
      event_kind := 'plate_deleted';
    else
      previous_snapshot := public.plate_assignment_snapshot(old.plate_id);
      current_snapshot := public.plate_assignment_snapshot(new.plate_id);
      event_kind := 'changed';
    end if;

    insert into public.plate_assignment_history (
      service_date, event_type, previous_plate, current_plate, actor_email
    ) values (
      new.service_date, event_kind, previous_snapshot, current_snapshot,
      nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
    );
    return new;
  end if;

  previous_snapshot := public.plate_assignment_snapshot(old.plate_id);
  insert into public.plate_assignment_history (
    service_date, event_type, previous_plate, actor_email
  ) values (
    old.service_date, 'cleared', previous_snapshot,
    nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
  );
  return old;
end;
$$;

revoke all on function public.record_daily_plate_history()
  from public, anon, authenticated;

create trigger daily_plates_record_history
after insert or update or delete on public.daily_plates
for each row
execute function public.record_daily_plate_history();

create function public.prevent_unassigned_daily_plates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plate_id is null then
    if tg_op = 'UPDATE'
      and old.plate_id is not null
      and not exists (
        select 1 from public.plates where id = old.plate_id
      )
    then
      return new;
    end if;
    raise exception 'A scheduled date must have a plate assignment.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_unassigned_daily_plates()
  from public, anon, authenticated;

create trigger daily_plates_require_assignment
before insert or update on public.daily_plates
for each row
execute function public.prevent_unassigned_daily_plates();

alter table public.daily_plates
  alter column plate_id drop not null;

alter table public.daily_plates
  drop constraint daily_plates_plate_id_fkey,
  add constraint daily_plates_plate_id_fkey
    foreign key (plate_id) references public.plates (id) on delete set null;

create function public.prevent_deleting_scheduled_plates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.daily_plates
    where plate_id = old.id
      and service_date >= (now() at time zone 'Africa/Johannesburg')::date
  ) then
    raise exception 'This plate is assigned for today or a future date.'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_deleting_scheduled_plates()
  from public, anon, authenticated;

create trigger plates_prevent_scheduled_delete
before delete on public.plates
for each row
execute function public.prevent_deleting_scheduled_plates();

create function public.prevent_plate_assignment_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Plate assignment history is append-only.'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_plate_assignment_history_changes()
  from public, anon, authenticated;

create trigger plate_assignment_history_immutable
before update or delete on public.plate_assignment_history
for each row
execute function public.prevent_plate_assignment_history_changes();

insert into public.plate_assignment_history (
  service_date,
  event_type,
  current_plate,
  occurred_at
)
select
  daily_plates.service_date,
  'backfilled',
  jsonb_build_object(
    'id', plates.id,
    'name', plates.name,
    'description', plates.description,
    'price_cents', plates.price_cents,
    'image_url', plates.image_url
  ),
  daily_plates.created_at
from public.daily_plates
join public.plates on plates.id = daily_plates.plate_id
order by daily_plates.created_at, daily_plates.service_date;
