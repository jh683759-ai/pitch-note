-- =====================================================================
-- 4주차: 기록원 (가입 신청 → 감독 승인)
--
-- 감독이 경기를 뛰는 날에도 기록할 수 있게, 감독이 승인한 팀원(기록원)이
-- 경기를 기록한다.
--   - 기록원이 할 수 있는 것: 경기 만들기·정보 고치기·스코어, 출석(용병 추가 포함),
--     골·실점 기록과 고치기
--   - 기록원이 못 하는 것: 경기·골/실점 기록 삭제, 선수 명단 수정, 메모·MVP,
--     공유 링크, 팀원 권한 관리 (모두 감독만)
-- 화면에서 버튼만 숨기는 게 아니라 RLS로 막는다. 정책이 없으면 거부라서
-- 기록원에게는 삭제(delete) 정책을 아예 만들지 않는다.
-- 누가 기록·수정했는지 경기와 골/실점에 남긴다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 팀원(기록원) 신청·승인
-- ---------------------------------------------------------------------
create table public.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 20),
  email        text,
  -- pending=승인 대기, recorder=기록원. 거절·권한 빼기는 행을 지운다.
  status       text not null default 'pending' check (status in ('pending', 'recorder')),
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id) on delete set null
);

comment on table public.members is '감독이 승인한 기록원과 승인 대기 중인 가입 신청. 감독은 coaches 테이블.';

-- 앱의 가입 신청 화면으로 만든 계정만 신청 목록에 올린다.
-- (대시보드에서 만든 감독 계정 등은 표시가 없어서 올라오지 않는다)
create or replace function public.handle_member_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'signup' = 'pitch-note' then
    insert into public.members (user_id, display_name, email)
    values (
      new.id,
      left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 20),
      new.email
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_member
  after insert on auth.users
  for each row execute function public.handle_member_signup();

-- 권한 확인 함수 (security definer: members RLS를 거치지 않고 확인)
create or replace function public.is_recorder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.status = 'recorder'
  );
$$;

-- 화면이 메뉴를 고를 때 쓰는 내 역할: coach / recorder / pending / none
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.coaches c where c.user_id = (select auth.uid())) then 'coach'
    else coalesce((select m.status from public.members m where m.user_id = (select auth.uid())), 'none')
  end;
$$;

-- 기록한 사람 이름 표시용. 감독·기록원만 부를 수 있다.
create or replace function public.staff_names()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, c.display_name from public.coaches c
  where public.is_coach() or public.is_recorder()
  union all
  select m.user_id, m.display_name from public.members m
  where m.status = 'recorder' and (public.is_coach() or public.is_recorder());
$$;

alter table public.members enable row level security;

-- 본인 행은 본인이 본다 (승인 대기 화면)
create policy members_select_self on public.members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 권한을 뺏긴 사람이 다시 신청할 때: 본인 행을 '승인 대기'로만 만들 수 있다
create policy members_request_self on public.members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and approved_at is null and approved_by is null);

-- 감독은 전부 (승인·거절·권한 빼기)
create policy members_coach_all on public.members
  for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

grant select, insert, update, delete on public.members to authenticated;

-- ---------------------------------------------------------------------
-- 기록원 RLS (감독 정책과 OR로 합쳐진다). delete 정책은 없다.
-- ---------------------------------------------------------------------
create policy players_recorder_select on public.players
  for select to authenticated using ((select public.is_recorder()));
-- 경기 날 처음 온 용병은 기록원도 이름만으로 추가할 수 있다
create policy players_recorder_add_guest on public.players
  for insert to authenticated with check ((select public.is_recorder()) and membership = 'guest');

create policy seasons_recorder_select on public.seasons
  for select to authenticated using ((select public.is_recorder()));
create policy seasons_recorder_insert on public.seasons
  for insert to authenticated with check ((select public.is_recorder()));

create policy matches_recorder_select on public.matches
  for select to authenticated using ((select public.is_recorder()));
create policy matches_recorder_insert on public.matches
  for insert to authenticated with check ((select public.is_recorder()));
create policy matches_recorder_update on public.matches
  for update to authenticated using ((select public.is_recorder())) with check ((select public.is_recorder()));

-- 출석은 저장할 때 명단을 통째로 맞추므로(빠진 선수 행 삭제) 삭제까지 허용한다.
-- 출석 행은 기록이 아니라 명단이고, 경기 화면에서 언제든 다시 체크할 수 있다.
create policy match_attendance_recorder_all on public.match_attendance
  for all to authenticated using ((select public.is_recorder())) with check ((select public.is_recorder()));

create policy goal_events_recorder_select on public.goal_events
  for select to authenticated using ((select public.is_recorder()));
create policy goal_events_recorder_insert on public.goal_events
  for insert to authenticated with check ((select public.is_recorder()));
create policy goal_events_recorder_update on public.goal_events
  for update to authenticated using ((select public.is_recorder())) with check ((select public.is_recorder()));

-- 골 하나의 태그·코트 위 명단은 고칠 때 통째로 다시 쓴다 (골 기록 자체는 안 지워진다)
create policy goal_event_tags_recorder_all on public.goal_event_tags
  for all to authenticated using ((select public.is_recorder())) with check ((select public.is_recorder()));
create policy goal_event_on_court_recorder_all on public.goal_event_on_court
  for all to authenticated using ((select public.is_recorder())) with check ((select public.is_recorder()));

create policy event_tags_recorder_select on public.event_tags
  for select to authenticated using ((select public.is_recorder()));

-- 메모는 '팀 공개'만 읽기 (공유 링크로 선수들도 보는 것). 쓰기는 감독만.
create policy match_notes_recorder_select_team on public.match_notes
  for select to authenticated using ((select public.is_recorder()) and visibility = 'team');

-- MVP는 감독만 고른다. 출석이 바뀌어 자동으로 비워지는 것(null)은 막지 않는다.
create or replace function public.check_mvp_by_coach()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mvp_player_id is not null
     and (tg_op = 'INSERT' or new.mvp_player_id is distinct from old.mvp_player_id)
     and not public.is_coach() then
    raise exception 'MVP는 감독만 고를 수 있습니다' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger matches_mvp_by_coach
  before insert or update of mvp_player_id on public.matches
  for each row execute function public.check_mvp_by_coach();

-- ---------------------------------------------------------------------
-- 누가 기록·수정했는지
-- ---------------------------------------------------------------------
alter table public.matches
  add column created_by uuid default auth.uid(),
  add column updated_by uuid;
alter table public.goal_events
  add column created_by uuid default auth.uid(),
  add column updated_by uuid;

comment on column public.matches.created_by is '경기를 만든 사람 (auth.users.id)';
comment on column public.matches.updated_by is '마지막으로 고친 사람 (auth.users.id)';

create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by; -- 만든 사람은 바꿀 수 없다
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger matches_set_updated_by
  before update on public.matches
  for each row execute function public.set_updated_by();
create trigger goal_events_set_updated_by
  before update on public.goal_events
  for each row execute function public.set_updated_by();

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke all on function public.handle_member_signup() from public, anon, authenticated;
revoke all on function public.is_recorder() from public;
revoke all on function public.my_role() from public;
revoke all on function public.staff_names() from public;
revoke all on function public.check_mvp_by_coach() from public, anon;
revoke all on function public.set_updated_by() from public, anon;
grant execute on function public.is_recorder() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.staff_names() to authenticated;
