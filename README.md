# pitch-note

아마추어 풋살팀 감독을 위한 경기 기록 사이트. **많이 모으고, 지금 필요한 것만 본다.**

경기 후 5분 입력으로 출석, 득점 유형, 실점 원인, 골·실점 순간 코트 위 4명까지 남기고, 화면에는 "지금 상황과 다음 할 일"만 보여줍니다. 선수 페이지는 순위보다 본인의 성장 추이를 먼저 보여줍니다.

- 프론트: Next.js 15 (App Router, TypeScript, Tailwind) — 모바일 웹
- 백엔드: Supabase (PostgreSQL, Auth, RLS)
- CI: GitHub Actions (lint · typecheck · build · DB 테스트)

## 진행 상황 (4주 MVP)

| 주차 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 전체 데이터 모델, 감독 로그인, 선수 관리 | ✅ |
| 2 | 경기 입력(태그·코트 위 4명·명단 복사), 집계 쿼리 연결 | |
| 3 | 대시보드, 선수 성장 페이지, 공유 링크, 카톡 미리보기 | |
| 4 | 실경기 입력, 다음 훈련 메모, 배포, README 정리 | |

## 데이터 모델

```
coaches ── auth.users          (감독만 쓰기)
players                         (고정/용병, 보관)
seasons ─< matches              (날짜, 상대, 스코어, 영상 링크)
matches ─< match_notes          (경기 전 계획 / 잘된 점 / 개선점 / 다음 경기 포인트 ≤3 / 선수 개인 코멘트, 메모마다 공개 범위)
matches ─< match_attendance >─ players     (출전/벤치/불참 + 당일 고정/용병)
matches ─< goal_events                     (우리 골 / 실점, 득점자·어시스트·GK)
goal_events ─< goal_event_tags >─ event_tags   (득점 유형 / 실점 원인, 바꿀 수 있는 태그)
goal_events ─< goal_event_on_court >─ players  (그 순간 코트 위 필드 4명)
share_links                     (선수용 읽기 전용 링크 토큰)
```

집계 뷰 (`security_invoker`, RLS 그대로 적용): `match_summary`, `player_season_stats`, `lineup_goal_diff`, `tag_counts`

### 설계 선택

- **집계값을 저장하지 않는다.** 통계는 원천 테이블에서 뷰로 계산한다. 경기 기록을 고쳐도 숫자가 어긋나지 않는다.
- **태그는 테이블.** 실경기 몇 번 뒤 태그를 바꿀 수 있고, 숨긴 태그의 과거 기록도 남는다.
- **DB가 무결성을 지킨다.** 불참한 선수는 득점자가 될 수 없고, 코트 위 필드 플레이어는 4명까지, 실점에는 득점 유형 태그를 붙일 수 없다(트리거).
- **메모마다 공개 범위.** 경기 리뷰와 다음 경기 포인트는 선수에게 공개(team)할 수 있고, 기본값은 감독만(coach). 선수 개인 코멘트는 항상 감독만.
- **기록은 지우지 않는다.** 기록 있는 선수는 FK가 삭제를 막고, 대신 보관한다.
- **출석의 당일 신분.** 용병이 나중에 고정 멤버가 돼도 그날 기록은 용병으로 남아 출석률이 왜곡되지 않는다.
- **RLS.** 로그인 안 한 사용자(anon)는 테이블을 직접 읽지 못한다. 공유 페이지는 토큰을 검사하는 함수로만 연다(3주차).

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL과 anon(publishable) 키 입력
npm run dev
```

## Supabase 처음 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성 (Region: Northeast Asia (Seoul))
2. SQL Editor에서 `supabase/migrations/` 의 SQL을 순서대로 실행 (또는 `npx supabase link` 후 `npx supabase db push`)
3. Authentication → Users → **Add user** 로 감독 계정 생성 (Auto Confirm 체크)
4. Authentication → Sign In / Providers 에서 **Allow new users to sign up 끄기** (감독 외 가입 차단)
5. SQL Editor에서 감독 등록:
   ```sql
   insert into public.coaches (user_id, display_name)
   select id, '감독' from auth.users where email = '감독 이메일';
   ```
6. Project Settings → API 의 URL과 anon(publishable) 키를 `.env.local` 에 입력

## 스크립트

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run lint` / `npm run typecheck` / `npm run build` | 정적 검사와 빌드 |
| `npm run test:db` | PGlite(WASM PostgreSQL)에 마이그레이션 적용 후 RLS·트리거·집계 뷰 테스트 |
| `npm run db:types` | 연결된 Supabase 프로젝트에서 TypeScript 타입 재생성 |
