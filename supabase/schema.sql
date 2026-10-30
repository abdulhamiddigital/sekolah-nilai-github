-- RUANG NILAI SEKOLAH - skema awal Supabase PostgreSQL
-- Jalankan melalui Supabase Dashboard > SQL Editor.
-- Setelah menjalankan, baca README.md untuk membuat akun dan menetapkan peran.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'siswa' check (role in ('admin','guru','siswa')),
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  student_number text unique,
  name text not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, subject_id)
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  assessment text not null,
  term text not null check (term in ('Ganjil','Genap')),
  school_year text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  notes text,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, assessment, term, school_year)
);

create index if not exists idx_students_class on public.students(class_id);
create index if not exists idx_students_profile on public.students(profile_id);
create index if not exists idx_assignments_teacher on public.teacher_assignments(teacher_id);
create index if not exists idx_grades_student on public.grades(student_id);
create index if not exists idx_grades_class_subject on public.grades(class_id, subject_id);

-- Trigger: akun baru mendapat profil default siswa. Admin kemudian mengubah perannya.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name',''), 'siswa')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper SECURITY DEFINER menghindari rekursi policy RLS.
create or replace function public.current_role()
returns text language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.can_teach(p_class uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = (select auth.uid())
      and ta.class_id = p_class and ta.subject_id = p_subject
  )
$$;

create or replace function public.owns_student(p_student uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student and s.profile_id = (select auth.uid())
  )
$$;

create or replace function public.is_assigned_student(p_class uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = (select auth.uid())
      and ta.class_id = p_class and ta.subject_id = p_subject
  )
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists grades_touch_updated_at on public.grades;
create trigger grades_touch_updated_at before update on public.grades
for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.grades enable row level security;

-- Hak akses minimum. Pengaturan role hanya melalui admin SQL/console tepercaya.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke all on public.classes, public.subjects, public.students, public.teacher_assignments, public.grades from anon, authenticated;
grant select on public.classes, public.subjects, public.students, public.teacher_assignments, public.grades to authenticated;
grant insert, update, delete on public.students, public.teacher_assignments, public.classes, public.subjects to authenticated;
grant insert, update, delete on public.grades to authenticated;

-- PROFILES
drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profile update own display name" on public.profiles;
create policy "profile update own display name" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- CLASSES & SUBJECTS: pengguna terautentikasi boleh membaca; hanya admin mengelola.
drop policy if exists "authenticated read classes" on public.classes;
create policy "authenticated read classes" on public.classes for select to authenticated using (true);
drop policy if exists "admin manage classes" on public.classes;
create policy "admin manage classes" on public.classes for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read subjects" on public.subjects;
create policy "authenticated read subjects" on public.subjects for select to authenticated using (true);
drop policy if exists "admin manage subjects" on public.subjects;
create policy "admin manage subjects" on public.subjects for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- STUDENTS: siswa membaca dirinya; guru membaca siswa pada kelas yang ditugaskan; admin mengelola.
drop policy if exists "student read self or assigned teacher" on public.students;
create policy "student read self or assigned teacher" on public.students for select to authenticated
using (profile_id = (select auth.uid()) or public.is_admin() or exists (
  select 1 from public.teacher_assignments ta where ta.teacher_id = (select auth.uid()) and ta.class_id = students.class_id
));
drop policy if exists "admin manage students" on public.students;
create policy "admin manage students" on public.students for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ASSIGNMENTS: guru membaca penugasan sendiri; admin mengelola semua.
drop policy if exists "read own assignments or admin" on public.teacher_assignments;
create policy "read own assignments or admin" on public.teacher_assignments for select to authenticated
using (teacher_id = (select auth.uid()) or public.is_admin());
drop policy if exists "admin manage assignments" on public.teacher_assignments;
create policy "admin manage assignments" on public.teacher_assignments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- GRADES: siswa hanya membaca nilai sendiri; guru sesuai kelas+mapel; admin seluruhnya.
drop policy if exists "read permitted grades" on public.grades;
create policy "read permitted grades" on public.grades for select to authenticated
using (public.owns_student(student_id) or public.can_teach(class_id, subject_id));

drop policy if exists "insert permitted grades" on public.grades;
create policy "insert permitted grades" on public.grades for insert to authenticated
with check (
  public.can_teach(class_id, subject_id)
  and exists (select 1 from public.students s where s.id = student_id and s.class_id = class_id and s.active = true)
  and entered_by = (select auth.uid())
);

drop policy if exists "update permitted grades" on public.grades;
create policy "update permitted grades" on public.grades for update to authenticated
using (public.can_teach(class_id, subject_id))
with check (
  public.can_teach(class_id, subject_id)
  and exists (select 1 from public.students s where s.id = student_id and s.class_id = class_id and s.active = true)
  and entered_by = (select auth.uid())
);

drop policy if exists "delete permitted grades" on public.grades;
create policy "delete permitted grades" on public.grades for delete to authenticated
using (public.can_teach(class_id, subject_id));

-- Penting: jangan pernah membuat policy USING(true) untuk tabel nilai/profil.
