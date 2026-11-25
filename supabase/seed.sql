-- 로컬 개발용 시드 (supabase db reset 때만 실행, 운영에는 넣지 않음)
insert into public.seasons (name, starts_on, ends_on)
values ('2026 시즌', '2026-01-01', '2026-12-31')
on conflict (name) do nothing;

insert into public.players (name, jersey_number, main_position, membership) values
  ('김골키', 1,  'GK',   'regular'),
  ('이픽소', 4,  'FIXO', 'regular'),
  ('박아라', 7,  'ALA',  'regular'),
  ('최아라', 11, 'ALA',  'regular'),
  ('정피보', 9,  'PIVO', 'regular'),
  ('강멀티', 10, 'ALA',  'regular'),
  ('윤수비', 5,  'FIXO', 'regular'),
  ('용병A',  null, 'PIVO', 'guest');
