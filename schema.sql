begin;

create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  expires_at timestamptz not null,
  max_devices integer not null default 1 check (max_devices > 0),
  device_ids text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint license_key_format check (license_key ~ '^[A-Z0-9][A-Z0-9-]{6,63}$')
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  app_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.licenses enable row level security;
alter table public.servers enable row level security;

-- No anonymous/authenticated policies are created. Service-role access is server-side only.
revoke all on table public.licenses from anon, authenticated;
revoke all on table public.servers from anon, authenticated;

-- Seed test license for 30 days. Re-running the schema does not reset existing device bindings.
insert into public.licenses (license_key, expires_at, max_devices, is_active)
values ('FELIX-7KQ9-2M4X', now() + interval '30 days', 1, true)
on conflict (license_key) do nothing;

-- Placeholder only: replace app_url in the Supabase dashboard with a valid private share URL.
-- Do not put the real server URL into a public SQL file or repository.
insert into public.servers (name, location, app_url, is_active)
select 'FELIX SERVER', 'Happ connection', 'YOUR_PRIVATE_SERVER_URL', true
where not exists (
  select 1 from public.servers where name = 'FELIX SERVER' and location = 'Happ connection'
);

commit;
