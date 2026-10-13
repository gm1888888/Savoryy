-- ============================================================================
--  Savory -- Cooking & Recipe Blog
--  Complete Supabase schema: tables, indexes, triggers, RLS, storage policies.
--
--  HOW TO USE
--    1. Open your Supabase project -> SQL Editor -> New query
--    2. Paste this entire file and press RUN
--    3. Done. No sample data is inserted -- the database starts empty
--       and every recipe will come from a real user via the Upload page.
--
--  This script is idempotent: it is safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'difficulty') then
    create type public.difficulty as enum ('Easy', 'Medium', 'Hard');
  end if;
end
$$;

-- ============================================================================
--  TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles -- one row per authenticated user, created automatically by trigger
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default 'Cook',
  avatar_url  text,
  avatar_path text, -- storage object path, kept so the old blob can be deleted
  bio         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) between 1 and 80),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 300)
);

-- Safe for projects created before avatar_path existed.
alter table public.profiles add column if not exists avatar_path text;

comment on table public.profiles is
  'Public profile for each auth user. Created automatically on sign up.';

-- ----------------------------------------------------------------------------
-- Builds the single text blob that recipe search runs against.
--
-- Declared IMMUTABLE so it can back a generated column, which in turn can be
-- indexed. This is what lets /search match on ingredients without ever
-- pulling rows into the browser.
-- ----------------------------------------------------------------------------
create or replace function public.recipe_search_text(
  p_title text,
  p_description text,
  p_category text,
  p_tags text[],
  p_ingredients jsonb
)
returns text
language sql
immutable
as $$
  select concat_ws(
    ' ',
    coalesce(p_title, ''),
    coalesce(p_description, ''),
    coalesce(p_category, ''),
    coalesce(array_to_string(p_tags, ' '), ''),
    coalesce(
      (
        select string_agg(element ->> 'item', ' ')
        from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as element
      ),
      ''
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- recipes
-- ----------------------------------------------------------------------------
create table if not exists public.recipes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  description      text not null default '',
  category         text not null,
  difficulty       public.difficulty not null default 'Easy',
  preparation_time integer not null default 0,
  cooking_time     integer not null default 0,
  -- Always derived from prep + cook so the two can never disagree.
  total_time       integer generated always as (preparation_time + cooking_time) stored,
  servings         integer not null default 1,
  image_url        text,
  image_path       text, -- storage object path, kept so the blob can be deleted
  ingredients      jsonb not null default '[]'::jsonb,
  instructions     jsonb not null default '[]'::jsonb,
  tags             text[] not null default '{}',
  -- One searchable blob covering title, description, category, tags AND
  -- ingredients, so /search can match any of them with a single indexed query.
  search_text      text generated always as (
                     public.recipe_search_text(
                       title, description, category, tags, ingredients
                     )
                   ) stored,
  -- Denormalised counters maintained by triggers. PostgREST cannot ORDER BY a
  -- nested aggregate, so "most liked" sorting needs a real, indexable column.
  likes_count      integer not null default 0,
  comments_count   integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recipes_title_length check (char_length(trim(title)) between 3 and 120),
  constraint recipes_description_length check (char_length(description) <= 500),
  constraint recipes_prep_time_range check (preparation_time between 0 and 10080),
  constraint recipes_cook_time_range check (cooking_time between 0 and 10080),
  constraint recipes_servings_range check (servings between 1 and 100),
  constraint recipes_ingredients_is_array check (jsonb_typeof(ingredients) = 'array'),
  constraint recipes_instructions_is_array check (jsonb_typeof(instructions) = 'array'),
  constraint recipes_has_ingredients check (jsonb_array_length(ingredients) between 1 and 100),
  constraint recipes_has_instructions check (jsonb_array_length(instructions) between 1 and 100),
  constraint recipes_tag_count check (array_length(tags, 1) is null or array_length(tags, 1) <= 10),
  constraint recipes_counts_non_negative check (likes_count >= 0 and comments_count >= 0)
);

comment on column public.recipes.total_time is
  'Generated column: preparation_time + cooking_time. Never written directly.';
comment on column public.recipes.likes_count is
  'Denormalised count maintained by trigger on public.likes.';

-- ----------------------------------------------------------------------------
-- likes -- unique per (user, recipe) so the same user cannot like twice
-- ----------------------------------------------------------------------------
create table if not exists public.likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_unique_user_recipe unique (user_id, recipe_id)
);

-- ----------------------------------------------------------------------------
-- bookmarks -- unique per (user, recipe)
-- ----------------------------------------------------------------------------
create table if not exists public.bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bookmarks_unique_user_recipe unique (user_id, recipe_id)
);

-- ----------------------------------------------------------------------------
-- comments
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_content_length check (char_length(trim(content)) between 1 and 1000)
);

-- ============================================================================
--  INDEXES
-- ============================================================================
create index if not exists recipes_created_at_idx  on public.recipes (created_at desc);
create index if not exists recipes_user_id_idx     on public.recipes (user_id, created_at desc);
create index if not exists recipes_category_idx    on public.recipes (category, created_at desc);
create index if not exists recipes_difficulty_idx  on public.recipes (difficulty);
create index if not exists recipes_likes_count_idx on public.recipes (likes_count desc, created_at desc);
create index if not exists recipes_total_time_idx  on public.recipes (total_time asc);
create index if not exists recipes_tags_idx        on public.recipes using gin (tags);

-- Trigram indexes so ILIKE searches stay fast as the table grows.
-- Searching happens entirely in Postgres, never in the browser.
create index if not exists recipes_title_trgm_idx
  on public.recipes using gin (title extensions.gin_trgm_ops);
create index if not exists recipes_description_trgm_idx
  on public.recipes using gin (description extensions.gin_trgm_ops);
create index if not exists recipes_search_text_trgm_idx
  on public.recipes using gin (search_text extensions.gin_trgm_ops);

create index if not exists likes_recipe_id_idx     on public.likes (recipe_id);
create index if not exists likes_user_id_idx       on public.likes (user_id, created_at desc);
create index if not exists bookmarks_user_id_idx   on public.bookmarks (user_id, created_at desc);
create index if not exists bookmarks_recipe_id_idx on public.bookmarks (recipe_id);
create index if not exists comments_recipe_id_idx  on public.comments (recipe_id, created_at desc);
create index if not exists comments_user_id_idx    on public.comments (user_id);

-- ============================================================================
--  FUNCTIONS & TRIGGERS
-- ============================================================================

-- Keep updated_at honest on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Create a profile automatically whenever someone signs up.
--
-- Runs as SECURITY DEFINER because the new user has no session yet (and with
-- email confirmation enabled will not have one for a while). Creating the
-- profile from the client would fail RLS.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Maintain recipes.likes_count
-- ----------------------------------------------------------------------------
create or replace function public.sync_recipe_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.recipes
      set likes_count = likes_count + 1
      where id = new.recipe_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.recipes
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.recipe_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists likes_sync_count on public.likes;
create trigger likes_sync_count
  after insert or delete on public.likes
  for each row execute function public.sync_recipe_likes_count();

-- ----------------------------------------------------------------------------
-- Maintain recipes.comments_count
-- ----------------------------------------------------------------------------
create or replace function public.sync_recipe_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.recipes
      set comments_count = comments_count + 1
      where id = new.recipe_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.recipes
      set comments_count = greatest(comments_count - 1, 0)
      where id = old.recipe_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists comments_sync_count on public.comments;
create trigger comments_sync_count
  after insert or delete on public.comments
  for each row execute function public.sync_recipe_comments_count();

-- ============================================================================
--  ROW LEVEL SECURITY
--
--  Every table below denies access by default. The policies are the only way
--  in. Authorisation is enforced here, in the database -- the UI merely
--  reflects it.
-- ============================================================================

alter table public.profiles  enable row level security;
alter table public.recipes   enable row level security;
alter table public.likes     enable row level security;
alter table public.bookmarks enable row level security;
alter table public.comments  enable row level security;

-- ---------------------------------- profiles --------------------------------
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------- recipes ---------------------------------
drop policy if exists "Recipes are viewable by everyone" on public.recipes;
create policy "Recipes are viewable by everyone"
  on public.recipes for select
  using (true);

drop policy if exists "Authenticated users can create recipes" on public.recipes;
create policy "Authenticated users can create recipes"
  on public.recipes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own recipes" on public.recipes;
create policy "Users can update their own recipes"
  on public.recipes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own recipes" on public.recipes;
create policy "Users can delete their own recipes"
  on public.recipes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------- likes ----------------------------------
drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone"
  on public.likes for select
  using (true);

drop policy if exists "Users can like as themselves" on public.likes;
create policy "Users can like as themselves"
  on public.likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes"
  on public.likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- --------------------------------- bookmarks --------------------------------
-- Bookmarks are private: a user can only ever see their own.
drop policy if exists "Users can read their own bookmarks" on public.bookmarks;
create policy "Users can read their own bookmarks"
  on public.bookmarks for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can bookmark as themselves" on public.bookmarks;
create policy "Users can bookmark as themselves"
  on public.bookmarks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own bookmarks" on public.bookmarks;
create policy "Users can remove their own bookmarks"
  on public.bookmarks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------- comments --------------------------------
drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
  on public.comments for select
  using (true);

drop policy if exists "Authenticated users can comment" on public.comments;
create policy "Authenticated users can comment"
  on public.comments for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own comments" on public.comments;
create policy "Users can update their own comments"
  on public.comments for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
--  MEAL PLANS
--
--  Each row puts one recipe on one day for breakfast, lunch or dinner.
--  Plans are private: every policy below limits a user to their own rows.
-- ============================================================================

create table if not exists public.meal_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- A deleted recipe takes its planned meals with it.
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  planned_date date not null,
  meal_type    text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint meal_plans_meal_type check (meal_type in ('breakfast', 'lunch', 'dinner'))
);

create index if not exists meal_plans_user_date_idx on public.meal_plans (user_id, planned_date);
create index if not exists meal_plans_recipe_id_idx on public.meal_plans (recipe_id);

drop trigger if exists meal_plans_set_updated_at on public.meal_plans;
create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute function public.set_updated_at();

alter table public.meal_plans enable row level security;

drop policy if exists "Users can read their own meal plans" on public.meal_plans;
create policy "Users can read their own meal plans"
  on public.meal_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own meal plans" on public.meal_plans;
create policy "Users can add their own meal plans"
  on public.meal_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own meal plans" on public.meal_plans;
create policy "Users can update their own meal plans"
  on public.meal_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own meal plans" on public.meal_plans;
create policy "Users can delete their own meal plans"
  on public.meal_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
--  STORAGE
--
--  Files live at  <bucket>/<user-id>/<filename>  so ownership is derived from
--  the first path segment. Both buckets are public for reading (recipe photos
--  are meant to be seen) but writeable only inside your own folder.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images', 'recipe-images', true, 5242880,
  array['image/jpeg','image/jpg','image/png','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images', 'profile-images', true, 5242880,
  array['image/jpeg','image/jpg','image/png','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------ recipe-images -------------------------------
drop policy if exists "Recipe images are publicly readable" on storage.objects;
create policy "Recipe images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

drop policy if exists "Users can upload their own recipe images" on storage.objects;
create policy "Users can upload their own recipe images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own recipe images" on storage.objects;
create policy "Users can update their own recipe images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own recipe images" on storage.objects;
create policy "Users can delete their own recipe images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ------------------------------ profile-images ------------------------------
drop policy if exists "Profile images are publicly readable" on storage.objects;
create policy "Profile images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'profile-images');

drop policy if exists "Users can upload their own profile image" on storage.objects;
create policy "Users can upload their own profile image"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own profile image" on storage.objects;
create policy "Users can update their own profile image"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own profile image" on storage.objects;
create policy "Users can delete their own profile image"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================================
--  NO SEED DATA.
--  This script intentionally inserts zero recipes, users or comments.
--  The first recipe must come from a real person using the Upload page.
-- ============================================================================
