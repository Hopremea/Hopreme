-- MITMIT : etat du cockpit partage par toute l'equipe PEN'UP 3D.
-- v1 : une seule fiche JSON partagee (id = 'shared'), lue et ecrite par tout
-- utilisateur authentifie via Clerk. La normalisation des donnees reste cote app.
-- A coller dans Supabase : SQL Editor > New query > Run.

create table if not exists public.cockpit_state (
  id text primary key default 'shared',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.cockpit_state enable row level security;

-- L'integration native Clerk-Supabase place le role "authenticated" dans le jeton.
-- Tout utilisateur MITMIT authentifie accede a la fiche partagee.
drop policy if exists "cockpit_select" on public.cockpit_state;
create policy "cockpit_select" on public.cockpit_state
  for select to authenticated using (true);

drop policy if exists "cockpit_insert" on public.cockpit_state;
create policy "cockpit_insert" on public.cockpit_state
  for insert to authenticated with check (true);

drop policy if exists "cockpit_update" on public.cockpit_state;
create policy "cockpit_update" on public.cockpit_state
  for update to authenticated using (true) with check (true);
