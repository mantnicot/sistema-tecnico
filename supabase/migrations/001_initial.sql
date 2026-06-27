-- TAVA · ejecutar en SQL Editor de Supabase (Dashboard → SQL → New query)

create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  linked_script_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  text text not null default '',
  pdf_storage_path text,
  created_at timestamptz not null default now()
);

alter table public.obras
  drop constraint if exists obras_linked_script_fk;
alter table public.obras
  add constraint obras_linked_script_fk
  foreign key (linked_script_id) references public.scripts (id) on delete set null;

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  name text not null,
  storage_path text not null,
  duration_sec double precision not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cues (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  char_offset int not null,
  track_id uuid not null references public.tracks (id) on delete cascade,
  cue_name text not null,
  mode text not null check (mode in ('fade_in', 'direct', 'fade_out')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists obras_user_id_idx on public.obras (user_id);
create index if not exists scripts_user_id_idx on public.scripts (user_id);
create index if not exists tracks_obra_id_idx on public.tracks (obra_id);
create index if not exists cues_obra_id_idx on public.cues (obra_id);

alter table public.obras enable row level security;
alter table public.scripts enable row level security;
alter table public.tracks enable row level security;
alter table public.cues enable row level security;

drop policy if exists "obras_select_own" on public.obras;
drop policy if exists "obras_insert_own" on public.obras;
drop policy if exists "obras_update_own" on public.obras;
drop policy if exists "obras_delete_own" on public.obras;
create policy "obras_select_own" on public.obras for select using (auth.uid() = user_id);
create policy "obras_insert_own" on public.obras for insert with check (auth.uid() = user_id);
create policy "obras_update_own" on public.obras for update using (auth.uid() = user_id);
create policy "obras_delete_own" on public.obras for delete using (auth.uid() = user_id);

drop policy if exists "scripts_select_own" on public.scripts;
drop policy if exists "scripts_insert_own" on public.scripts;
drop policy if exists "scripts_update_own" on public.scripts;
drop policy if exists "scripts_delete_own" on public.scripts;
create policy "scripts_select_own" on public.scripts for select using (auth.uid() = user_id);
create policy "scripts_insert_own" on public.scripts for insert with check (auth.uid() = user_id);
create policy "scripts_update_own" on public.scripts for update using (auth.uid() = user_id);
create policy "scripts_delete_own" on public.scripts for delete using (auth.uid() = user_id);

drop policy if exists "tracks_select_own" on public.tracks;
drop policy if exists "tracks_insert_own" on public.tracks;
drop policy if exists "tracks_update_own" on public.tracks;
drop policy if exists "tracks_delete_own" on public.tracks;
create policy "tracks_select_own" on public.tracks for select
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "tracks_insert_own" on public.tracks for insert
  with check (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "tracks_update_own" on public.tracks for update
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "tracks_delete_own" on public.tracks for delete
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));

drop policy if exists "cues_select_own" on public.cues;
drop policy if exists "cues_insert_own" on public.cues;
drop policy if exists "cues_update_own" on public.cues;
drop policy if exists "cues_delete_own" on public.cues;
create policy "cues_select_own" on public.cues for select
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "cues_insert_own" on public.cues for insert
  with check (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "cues_update_own" on public.cues for update
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));
create policy "cues_delete_own" on public.cues for delete
  using (exists (select 1 from public.obras o where o.id = obra_id and o.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('tava-audio', 'tava-audio', false, 104857600),
  ('tava-documents', 'tava-documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "audio_read_own" on storage.objects;
drop policy if exists "audio_insert_own" on storage.objects;
drop policy if exists "audio_delete_own" on storage.objects;
drop policy if exists "docs_read_own" on storage.objects;
drop policy if exists "docs_insert_own" on storage.objects;
drop policy if exists "docs_delete_own" on storage.objects;

create policy "audio_read_own" on storage.objects for select
  using (bucket_id = 'tava-audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audio_insert_own" on storage.objects for insert
  with check (bucket_id = 'tava-audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audio_delete_own" on storage.objects for delete
  using (bucket_id = 'tava-audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "docs_read_own" on storage.objects for select
  using (bucket_id = 'tava-documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_insert_own" on storage.objects for insert
  with check (bucket_id = 'tava-documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_delete_own" on storage.objects for delete
  using (bucket_id = 'tava-documents' and auth.uid()::text = (storage.foldername(name))[1]);
