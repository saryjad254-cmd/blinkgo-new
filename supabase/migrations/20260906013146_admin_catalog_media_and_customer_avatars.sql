-- Production catalog control and durable public media.
-- All mutations are performed by authenticated server routes using the
-- service role. Browser roles intentionally receive no direct table or
-- Storage write privileges.

alter table public.restaurants add column if not exists archived_at timestamptz;
alter table public.restaurants add column if not exists type text not null default 'restaurant';
alter table public.restaurants add column if not exists logo_url text;
alter table public.restaurants add column if not exists cover_url text;

alter table public.restaurants drop constraint if exists restaurants_type_check;
alter table public.restaurants add constraint restaurants_type_check
  check (type in ('restaurant', 'market', 'pharmacy', 'shop'));

create index if not exists restaurants_admin_state_idx
  on public.restaurants (archived_at, is_active, is_hidden, type);

-- Extend the existing catalog category table.  Keeping one category source is
-- important because storefront queries and products.category_id already use it.
alter table public.categories add column if not exists description text;
alter table public.categories add column if not exists is_hidden boolean not null default false;
alter table public.categories add column if not exists updated_at timestamptz not null default now();
alter table public.categories add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.categories add column if not exists updated_by uuid references public.users(id) on delete set null;

create index if not exists categories_restaurant_admin_order_idx
  on public.categories (restaurant_id, is_active, is_hidden, sort_order, name);

alter table public.categories enable row level security;
grant all on table public.categories to service_role;

-- category_id is already present in the production schema; this keeps fresh
-- environments compatible without replacing its existing foreign key.
alter table public.products add column if not exists category_id uuid;
create index if not exists products_category_id_idx on public.products(category_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('restaurant-images', 'restaurant-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatar-images', 'avatar-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets are readable through their public object URLs. No direct
-- browser INSERT/UPDATE/DELETE policies are created; service routes enforce
-- admin ownership and customer self-ownership before using service_role.
drop policy if exists catalog_media_browser_insert on storage.objects;
drop policy if exists catalog_media_browser_update on storage.objects;
drop policy if exists catalog_media_browser_delete on storage.objects;

comment on table public.categories is
  'Store-scoped product categories managed by authorized server routes; products retain category text for backwards-compatible storefront queries.';
