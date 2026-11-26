-- =====================================================================
-- 선수 계정 (가입 신청 → 감독이 명단의 선수와 연결해 승인)
--
-- 선수가 로그인하면 '내 페이지'만 본다.
--   - 볼 수 있는 것: 내 기록(공유 링크와 같은 범위), 경기 리뷰의 '팀 공개' 메모,
--     내가 쓴 선수 기록 노트
--   - 쓸 수 있는 것: 내 선수 기록 노트만 (내가 온 경기만)
--   - 못 하는 것: 경기·출석·골 기록, 다른 선수 노트, 감독 메모
-- 선수는 테이블을 직접 읽지 않는다. 공유 링크처럼 security definer 함수가
-- 돌려주는 것만 보인다. 선수 노트만 RLS로 본인 것을 읽고 쓴다.
-- 공유 링크(로그인 없이 보기)는 그대로다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- members: 무엇으로 신청했는지(wants), 승인된 선수 계정이면 어느 선수인지
-- ---------------------------------------------------------------------
alter table public.members
  add column wants text not null default 'recorder' check (wants in ('recorder', 'player')),
  add column player_id uuid references public.players (id) on delete cascade;

comment on column public.members.wants is '가입할 때 고른 것: recorder=기록원, player=선수';
comment on column public.members.player_id is '선수 계정이 연결된 명단의 선수. 계정 하나에 선수 한 명.';

alter table public.members drop constraint members_status_check;
alter table public.members
  add constraint members_status_check check (status in ('pending', 'recorder', 'player')),
  add constraint members_player_linked check ((status = 'player') = (player_id is not null));

create unique index members_player_unique on public.members (player_id) where player_id is not null;

-- 다시 신청할 때도 승인 대기로만, 선수 연결 없이
drop policy members_request_self on public.members;
create policy members_request_self on public.members
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'pending'
    and approved_at is null and approved_by is null and player_id is null
  );

create or replace function public.handle_member_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'signup' = 'pitch-note' then
    insert into public.members (user_id, display_name, email, wants)
    values (
      new.id,
      left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 20),
      new.email,
      case when new.raw_user_meta_data ->> 'wants' = 'player' then 'player' else 'recorder' end
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- 로그인한 선수 계정의 선수 id (선수 계정이 아니면 null)
create or replace function public.my_player_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.player_id from public.members m
  where m.user_id = (select auth.uid()) and m.status = 'player';
$$;

-- ---------------------------------------------------------------------
-- 선수 기록 노트: 감독 경기 노트와 같은 틀을 선수가 경기마다 쓴다
-- (잘된 점, 아쉬운 점, 다음 경기 내 포인트 1~3개). 본인과 감독만 본다.
-- ---------------------------------------------------------------------
create table public.player_notes (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  kind       text not null check (kind in ('good', 'improve', 'next_focus')),
  body       text not null check (length(trim(body)) between 1 and 500),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.player_notes is '선수가 직접 쓰는 경기별 기록 노트. 본인과 감독만 본다.';

create index player_notes_player_idx on public.player_notes (player_id, match_id, kind, sort_order);

create trigger player_notes_set_updated_at
  before update on public.player_notes
  for each row execute function public.set_updated_at();

-- 다음 경기 내 포인트는 경기당 3개까지
create or replace function public.check_player_focus_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'next_focus' and (
    select count(*) from public.player_notes n
    where n.match_id = new.match_id and n.player_id = new.player_id and n.kind = 'next_focus' and n.id <> new.id
  ) >= 3 then
    raise exception '다음 경기 내 포인트는 3개까지입니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger player_notes_focus_limit
  before insert or update on public.player_notes
  for each row execute function public.check_player_focus_limit();

-- 그 경기에 온(출전·벤치) 선수인지. 노트는 온 경기에만 쓴다.
create or replace function public.attended(p_match_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_attendance a
    join public.matches m on m.id = a.match_id and m.status = 'finished'
    where a.match_id = p_match_id and a.player_id = p_player_id and a.status in ('played', 'bench')
  );
$$;

alter table public.player_notes enable row level security;

-- 선수: 본인 노트만, 온 경기에만
create policy player_notes_self_select on public.player_notes
  for select to authenticated
  using (player_id = (select public.my_player_id()));
create policy player_notes_self_insert on public.player_notes
  for insert to authenticated
  with check (player_id = (select public.my_player_id()) and public.attended(match_id, player_id));
create policy player_notes_self_update on public.player_notes
  for update to authenticated
  using (player_id = (select public.my_player_id()))
  with check (player_id = (select public.my_player_id()) and public.attended(match_id, player_id));
create policy player_notes_self_delete on public.player_notes
  for delete to authenticated
  using (player_id = (select public.my_player_id()));

-- 감독: 읽기만 (선수의 글이라 고치지 않는다). 기록원은 못 본다.
create policy player_notes_coach_select on public.player_notes
  for select to authenticated
  using ((select public.is_coach()));

grant select, insert, update, delete on public.player_notes to authenticated;

-- 한 경기 노트를 통째로 저장 (한 번 호출 = 한 트랜잭션). RLS가 그대로 적용된다.
create or replace function public.save_my_notes(p_match_id uuid, p_notes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pid uuid := public.my_player_id();
  n integer;
begin
  if pid is null then
    raise exception '선수 계정만 노트를 쓸 수 있습니다' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_notes) <> 'array' then
    raise exception '노트 데이터 형식이 잘못됐습니다' using errcode = 'invalid_parameter_value';
  end if;
  if not public.attended(p_match_id, pid) then
    raise exception '내가 온 경기에만 노트를 쓸 수 있어요' using errcode = 'insufficient_privilege';
  end if;

  delete from public.player_notes where match_id = p_match_id and player_id = pid;

  insert into public.player_notes (match_id, player_id, kind, body, sort_order)
  select p_match_id, pid, r.kind, trim(r.body), (r.ord - 1)::smallint
  from rows from (jsonb_to_recordset(p_notes) as (kind text, body text))
       with ordinality as r (kind, body, ord)
  where r.kind in ('good', 'improve', 'next_focus')
    and length(trim(coalesce(r.body, ''))) > 0
  order by r.ord;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 경기 리뷰 JSON (공유 링크와 선수 계정이 같이 쓴다). 내부용.
-- ---------------------------------------------------------------------
create or replace function public.match_review_json(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id and status = 'finished';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', m.id,
    'played_on', m.played_on,
    'opponent', m.opponent,
    'match_type', m.match_type,
    'venue', m.venue,
    'our_score', m.our_score,
    'their_score', m.their_score,
    'mvp', (select jsonb_build_object('id', p.id, 'name', p.name) from public.players p where p.id = m.mvp_player_id),
    'players_played', (select count(*) from public.match_attendance a where a.match_id = m.id and a.status = 'played'),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', e.seq,
               'side', e.side,
               'own_goal', e.is_own_goal,
               'scorer', sc.name,
               'assist', ast.name,
               -- 실점 원인은 내보내지 않는다
               'tags', case when e.side = 'for' then coalesce((
                         select jsonb_agg(t.label order by t.sort_order)
                         from public.goal_event_tags gt join public.event_tags t on t.id = gt.tag_id
                         where gt.event_id = e.id), '[]'::jsonb) else '[]'::jsonb end
             ) order by e.seq)
      from public.goal_events e
      left join public.players sc on sc.id = e.scorer_id
      left join public.players ast on ast.id = e.assist_id
      where e.match_id = m.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body) order by n.kind, n.sort_order)
      from public.match_notes n
      where n.match_id = m.id and n.visibility = 'team' and n.kind in ('good', 'improve', 'next_focus')
    ), '[]'::jsonb)
  );
end;
$$;

-- 선수 기록 JSON (공유 링크와 선수 계정이 같이 쓴다). 내부용.
-- 본인이 온 경기만, 불참·순위·코트 위 실점·감독 메모는 없다.
create or replace function public.player_record_json(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.players;
begin
  select * into p from public.players where id = p_player_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'jersey_number', p.jersey_number,
    'main_position', p.main_position,
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'match_id', l.match_id,
               'played_on', l.played_on,
               'opponent', l.opponent,
               'status', l.status,
               'goals', l.goals,
               'assists', l.assists,
               'on_court_for', l.on_court_for,
               'mvp', m.mvp_player_id = p.id
             ) order by l.played_on, m.created_at)
      from public.player_match_log l
      join public.matches m on m.id = l.match_id
      where l.player_id = p.id and l.status in ('played', 'bench')
    ), '[]'::jsonb)
  );
end;
$$;

-- 공유 함수는 내부 함수를 부르게 바꾼다 (돌려주는 내용은 같다)
create or replace function public.shared_match(p_token text, p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.share_token_ok(p_token) then public.match_review_json(p_match_id) end;
$$;

create or replace function public.shared_player(p_token text, p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.share_token_ok(p_token) then public.player_record_json(p_player_id) end;
$$;

-- ---------------------------------------------------------------------
-- 선수 계정 '내 페이지': 내 기록 + 지금 할 일
--   next_match  : 마지막 경기의 '팀 공개' 다음 경기 포인트 (감독)
--   my_focus    : 내가 마지막으로 쓴 '다음 경기 내 포인트'
--   todo_match  : 내가 온 최근 경기인데 아직 노트를 안 썼으면 그 경기
-- ---------------------------------------------------------------------
create or replace function public.my_page()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := public.my_player_id();
  latest uuid;
  my_last uuid;
  last_attended uuid;
begin
  if pid is null then
    return null;
  end if;

  select m.id into latest from public.matches m
  where m.status = 'finished'
  order by m.played_on desc, m.created_at desc limit 1;

  select n.match_id into my_last from public.player_notes n
  join public.matches m on m.id = n.match_id
  where n.player_id = pid and n.kind = 'next_focus'
  order by m.played_on desc, m.created_at desc limit 1;

  select a.match_id into last_attended from public.match_attendance a
  join public.matches m on m.id = a.match_id and m.status = 'finished'
  where a.player_id = pid and a.status in ('played', 'bench')
  order by m.played_on desc, m.created_at desc limit 1;

  return public.player_record_json(pid) || jsonb_build_object(
    'team_focus', coalesce((
      select jsonb_agg(n.body order by n.sort_order) from public.match_notes n
      where n.match_id = latest and n.kind = 'next_focus' and n.visibility = 'team'
    ), '[]'::jsonb),
    'my_focus', coalesce((
      select jsonb_agg(n.body order by n.sort_order) from public.player_notes n
      where n.match_id = my_last and n.player_id = pid and n.kind = 'next_focus'
    ), '[]'::jsonb),
    'noted_match_ids', coalesce((
      select jsonb_agg(distinct n.match_id) from public.player_notes n where n.player_id = pid
    ), '[]'::jsonb),
    'todo_match', (
      select jsonb_build_object('id', m.id, 'played_on', m.played_on, 'opponent', m.opponent)
      from public.matches m
      where m.id = last_attended
        and not exists (select 1 from public.player_notes n where n.match_id = m.id and n.player_id = pid)
    )
  );
end;
$$;

-- 선수 계정 경기 화면: 경기 리뷰('팀 공개'만) + 내가 온 경기인지
create or replace function public.my_match(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := public.my_player_id();
  review jsonb;
begin
  if pid is null then
    return null;
  end if;
  review := public.match_review_json(p_match_id);
  if review is null then
    return null;
  end if;
  return review || jsonb_build_object('attended', public.attended(p_match_id, pid));
end;
$$;

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke all on function public.my_player_id() from public;
revoke all on function public.attended(uuid, uuid) from public, anon;
revoke all on function public.check_player_focus_limit() from public, anon;
revoke all on function public.save_my_notes(uuid, jsonb) from public, anon;
revoke all on function public.match_review_json(uuid) from public, anon, authenticated;
revoke all on function public.player_record_json(uuid) from public, anon, authenticated;
revoke all on function public.my_page() from public, anon;
revoke all on function public.my_match(uuid) from public, anon;
grant execute on function public.my_player_id() to authenticated;
-- RLS 정책 안에서 불린다
grant execute on function public.attended(uuid, uuid) to authenticated;
grant execute on function public.save_my_notes(uuid, jsonb) to authenticated;
grant execute on function public.my_page() to authenticated;
grant execute on function public.my_match(uuid) to authenticated;
