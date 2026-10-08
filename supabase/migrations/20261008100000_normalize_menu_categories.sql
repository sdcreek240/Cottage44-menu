create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  category_order integer not null check (category_order between 0 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_categories_public_order_idx
on public.menu_categories (category_order, id)
where active;

create trigger menu_categories_set_updated_at
before update on public.menu_categories
for each row
execute function public.set_updated_at();

insert into public.menu_categories (id, name, category_order)
values
  ('20000000-0000-4000-8000-000000000001', 'Toasties', 0),
  ('20000000-0000-4000-8000-000000000002', 'Healthy', 1),
  ('20000000-0000-4000-8000-000000000003', 'Lunch', 2),
  ('20000000-0000-4000-8000-000000000004', 'Burgers', 3),
  ('20000000-0000-4000-8000-000000000005', 'Singles', 4),
  ('20000000-0000-4000-8000-000000000006', 'Breakfast', 5)
on conflict (name) do nothing;

insert into public.menu_categories (name, category_order)
select existing.category, existing.category_order
from (
  select category, min(category_order) as category_order
  from public.menu_items
  group by category
) existing
on conflict (name) do nothing;

alter table public.menu_items add column category_id uuid;

update public.menu_items items
set category_id = categories.id
from public.menu_categories categories
where categories.name = items.category;

alter table public.menu_items
  alter column category_id set not null,
  add constraint menu_items_category_id_fkey
    foreign key (category_id)
    references public.menu_categories (id)
    on delete restrict;

drop index public.menu_items_public_order_idx;
alter table public.menu_items drop column category;
alter table public.menu_items drop column category_order;

create index menu_items_public_order_idx
on public.menu_items (category_id, item_order, id)
where active;

alter table public.menu_categories enable row level security;
revoke all on table public.menu_categories from anon, authenticated;
grant select on table public.menu_categories to anon, authenticated;
grant insert, update, delete on table public.menu_categories to authenticated;

create policy menu_categories_public_read
on public.menu_categories
for select
to anon
using (active);

create policy menu_categories_owner_read
on public.menu_categories
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_categories_owner_insert
on public.menu_categories
for insert
to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_categories_owner_update
on public.menu_categories
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_categories_owner_delete
on public.menu_categories
for delete
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');
