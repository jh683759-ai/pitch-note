-- =====================================================================
-- 다가오는 경기 준비
--
-- 감독이 '다음 경기'(status = scheduled)를 미리 만들고 경기 계획을 붙인다.
--   match_notes kind=plan   : 팀 포인트 1~3개 (선수에게 보인다)
--   match_notes kind=scout  : 상대 메모 (팀 공개 / 감독만)
--   match_resources         : 이 경기용 자료 (선수용 자료에서 골라 붙인다)
--   match_lineup            : 예상 포지션·조 (선수는 자기 것만 본다)
--   match_rsvp              : 참석 응답 (갈게요 / 못 가요). 선수 본인 또는 감독이 쓴다.
-- 경기가 끝나면 같은 경기를 '끝난 경기'로 바꾸고 출석·골·메모를 적는다.
-- 참석 응답은 출석 입력의 기본값으로만 쓴다 (공식 출석은 그대로 감독·기록원이 적는다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 경기 메모에 '상대 메모(scout)'를 더한다
-- ---------------------------------------------------------------------
alter table public.match_notes drop constraint match_notes_kind_check;
alter table public.match_notes
  add constraint match_notes_kind_check check (kind in ('plan', 'scout', 'good', 'improve', 'next_focus', 'player'));

comment on column public.match_notes.kind is
  'plan=경기 전 팀 포인트, scout=상대 메모, good=잘된 점, improve=개선점, next_focus=다음 경기 포인트, player=선수 개인 코멘트';

-- 경기 전 팀 포인트도 3개까지
create or replace function public.check_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'plan' and (
    select count(*) from public.match_notes n
    where n.match_id = new.match_id and n.kind = 'plan' and n.id <> new.id
  ) >= 3 then
    raise exception '경기 계획 팀 포인트는 3개까지입니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger match_notes_plan_limit
  before insert or update on public.match_notes
  for each row execute function public.check_plan_limit();

-- ---------------------------------------------------------------------
-- 이 경기용 자료
-- ---------------------------------------------------------------------
create table public.match_resources (
  match_id    uuid not null references public.matches (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  sort_order  smallint not null default 0,
  primary key (match_id, resource_id)
);

comment on table public.match_resources is '다음 경기 준비용으로 붙인 자료. 붙이면 대상과 상관없이 팀 전체가 본다.';

create index match_resources_resource_idx on public.match_resources (resource_id);

alter table public.match_resources enable row level security;
create policy match_resources_coach_all on public.match_resources
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
grant select, insert, update, delete on public.match_resources to authenticated;

-- 다가오는 경기에 붙은 자료는 선수 모두에게 온 자료로 본다 ('봤어요'를 누를 수 있게)
create or replace function public.resource_for_me(r public.resources)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_player_id() is not null and not r.is_archived and (
    r.audience = 'team'
    or (r.audience = 'position' and r.position = public.my_position())
    or (r.audience = 'player' and r.player_id = public.my_player_id())
    or exists (
      select 1 from public.match_resources mr join public.matches m on m.id = mr.match_id
      where mr.resource_id = r.id and m.status = 'scheduled'
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 예상 포지션·조
-- ---------------------------------------------------------------------
create table public.match_lineup (
  match_id  uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  position  text check (position in ('GK', 'FIXO', 'ALA', 'PIVO')),
  squad     smallint check (squad between 1 and 3),
  primary key (match_id, player_id),
  check (position is not null or squad is not null)
);

comment on table public.match_lineup is '경기 전 예상 포지션과 조(1조·2조). 계획일 뿐, 실제 출전은 출석·코트 위 기록이 맞다.';

alter table public.match_lineup enable row level security;
create policy match_lineup_coach_all on public.match_lineup
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
grant select, insert, update, delete on public.match_lineup to authenticated;

-- ---------------------------------------------------------------------
-- 참석 응답
-- ---------------------------------------------------------------------
create table public.match_rsvp (
  match_id    uuid not null references public.matches (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  answer      text not null check (answer in ('yes', 'no')),
  note        text check (length(note) <= 60),
  answered_by uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (match_id, player_id)
);

comment on table public.match_rsvp is '다가오는 경기 참석 응답. 출석 입력의 기본값으로만 쓰고, 공식 출석은 match_attendance.';
comment on column public.match_rsvp.answered_by is '누가 눌렀는지 (선수 본인 또는 감독이 대신)';

create trigger match_rsvp_set_updated_at
  before update on public.match_rsvp
  for each row execute function public.set_updated_at();

-- 응답은 아직 안 끝난(예정) 경기에만
create or replace function public.rsvp_open(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.matches m where m.id = p_match_id and m.status = 'scheduled');
$$;

alter table public.match_rsvp enable row level security;

create policy match_rsvp_self_select on public.match_rsvp
  for select to authenticated
  using (player_id = (select public.my_player_id()));
create policy match_rsvp_self_insert on public.match_rsvp
  for insert to authenticated
  with check (player_id = (select public.my_player_id()) and public.rsvp_open(match_id));
create policy match_rsvp_self_update on public.match_rsvp
  for update to authenticated
  using (player_id = (select public.my_player_id()))
  with check (player_id = (select public.my_player_id()) and public.rsvp_open(match_id));
create policy match_rsvp_self_delete on public.match_rsvp
  for delete to authenticated
  using (player_id = (select public.my_player_id()) and public.rsvp_open(match_id));
-- 감독: 대신 눌러 줄 수 있다 (계정 없는 선수, 단톡방으로 답한 선수)
create policy match_rsvp_coach_all on public.match_rsvp
  for all to authenticated using ((select public.is_coach())) with check ((select public.is_coach()));
-- 기록원: 출석 입력 기본값으로 읽기만
create policy match_rsvp_recorder_select on public.match_rsvp
  for select to authenticated using ((select public.is_recorder()));

grant select, insert, update, delete on public.match_rsvp to authenticated;

-- ---------------------------------------------------------------------
-- 경기 계획 저장 (감독). 한 번 호출 = 한 트랜잭션. RLS가 그대로 적용된다.
--   p_points   : ["팀 포인트", ...] 3개까지 (팀 공개)
--   p_scout    : [{"body": "...", "visibility": "team|coach"}]
--   p_resources: [resource_id, ...]
--   p_lineup   : [{"player_id": "...", "position": "PIVO", "squad": 1}]
-- ---------------------------------------------------------------------
create or replace function public.save_match_plan(
  p_match_id uuid,
  p_points jsonb,
  p_scout jsonb,
  p_resources uuid[],
  p_lineup jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception '경기 계획은 감독만 쓸 수 있습니다' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_typeof(p_scout) <> 'array' or jsonb_typeof(p_lineup) <> 'array' then
    raise exception '경기 계획 데이터 형식이 잘못됐습니다' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.match_notes where match_id = p_match_id and kind in ('plan', 'scout');

  insert into public.match_notes (match_id, kind, body, visibility, sort_order)
  select p_match_id, 'plan', trim(r.body), 'team', (r.ord - 1)::smallint
  from jsonb_array_elements_text(p_points) with ordinality as r (body, ord)
  where length(trim(r.body)) > 0
  order by r.ord;

  insert into public.match_notes (match_id, kind, body, visibility, sort_order)
  select p_match_id, 'scout', trim(r.body),
         case when r.visibility = 'team' then 'team' else 'coach' end, (r.ord - 1)::smallint
  from rows from (jsonb_to_recordset(p_scout) as (body text, visibility text)) with ordinality as r (body, visibility, ord)
  where length(trim(coalesce(r.body, ''))) > 0
  order by r.ord;

  delete from public.match_resources where match_id = p_match_id;
  insert into public.match_resources (match_id, resource_id, sort_order)
  select p_match_id, r.id, (r.ord - 1)::smallint
  from unnest(coalesce(p_resources, '{}')) with ordinality as r (id, ord)
  on conflict do nothing;

  delete from public.match_lineup where match_id = p_match_id;
  insert into public.match_lineup (match_id, player_id, position, squad)
  select p_match_id, r.player_id, nullif(r.position, ''), r.squad
  from jsonb_to_recordset(p_lineup) as r (player_id uuid, position text, squad smallint)
  where nullif(r.position, '') is not null or r.squad is not null;
end;
$$;

-- ---------------------------------------------------------------------
-- 선수 계정 '다음 경기' 카드
-- 오늘(한국 시간) 이후 예정 경기 중 가장 가까운 것 하나.
-- 팀 포인트, 상대 메모('팀 공개'만), 이 경기 자료, 내 예상 포지션·조, 내 응답, 응답 수.
-- 다른 선수의 포지션·응답 이름은 내보내지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.my_next_match()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := public.my_player_id();
  m public.matches;
begin
  if pid is null then
    return null;
  end if;

  select * into m from public.matches x
  where x.status = 'scheduled' and x.played_on >= (now() at time zone 'Asia/Seoul')::date
  order by x.played_on, x.kickoff_time nulls last, x.created_at
  limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', m.id,
    'played_on', m.played_on,
    'kickoff_time', to_char(m.kickoff_time, 'HH24:MI'),
    'opponent', m.opponent,
    'venue', m.venue,
    'match_type', m.match_type,
    'points', coalesce((
      select jsonb_agg(n.body order by n.sort_order) from public.match_notes n
      where n.match_id = m.id and n.kind = 'plan' and n.visibility = 'team'
    ), '[]'::jsonb),
    'scout', coalesce((
      select jsonb_agg(n.body order by n.sort_order) from public.match_notes n
      where n.match_id = m.id and n.kind = 'scout' and n.visibility = 'team'
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'title', r.title, 'url', r.url, 'note', r.note,
               'seen', exists (select 1 from public.resource_views v where v.resource_id = r.id and v.player_id = pid)
             ) order by mr.sort_order)
      from public.match_resources mr join public.resources r on r.id = mr.resource_id
      where mr.match_id = m.id and not r.is_archived
    ), '[]'::jsonb),
    'my_lineup', (
      select jsonb_build_object('position', l.position, 'squad', l.squad)
      from public.match_lineup l where l.match_id = m.id and l.player_id = pid
    ),
    'my_rsvp', (
      select jsonb_build_object('answer', v.answer, 'note', v.note)
      from public.match_rsvp v where v.match_id = m.id and v.player_id = pid
    ),
    'going', (select count(*) from public.match_rsvp v where v.match_id = m.id and v.answer = 'yes')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke all on function public.check_plan_limit() from public, anon;
revoke all on function public.rsvp_open(uuid) from public, anon;
revoke all on function public.save_match_plan(uuid, jsonb, jsonb, uuid[], jsonb) from public, anon;
revoke all on function public.my_next_match() from public, anon;
-- RLS 정책 안에서 불린다
grant execute on function public.rsvp_open(uuid) to authenticated;
grant execute on function public.save_match_plan(uuid, jsonb, jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.my_next_match() to authenticated;
