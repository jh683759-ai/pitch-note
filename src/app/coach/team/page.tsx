import { createClient } from "@/lib/supabase/server";
import { requireCoach } from "@/lib/role";
import { BackLink } from "../matches/ui";
import { MemberButtons } from "./member-buttons";

export const metadata = { title: "팀원 관리 · pitch-note" };

const dateFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

export default async function TeamPage() {
  await requireCoach();
  const supabase = await createClient();
  const [membersRes, playersRes] = await Promise.all([
    supabase.from("members").select("*").order("requested_at", { ascending: false }),
    supabase
      .from("players")
      .select("id, name, jersey_number, membership")
      .eq("is_active", true)
      .order("jersey_number", { ascending: true, nullsFirst: false })
      .order("name"),
  ]);
  const error = membersRes.error ?? playersRes.error;
  if (error) return <p className="mt-8 text-danger">불러오지 못했어요: {error.message}</p>;

  const data = membersRes.data ?? [];
  const pending = data.filter((m) => m.status === "pending");
  const recorders = data.filter((m) => m.status === "recorder");
  const playerAccounts = data.filter((m) => m.status === "player");
  const allPlayers = playersRes.data ?? [];
  const playerName = new Map(allPlayers.map((p) => [p.id, p.name]));
  const linked = new Set(playerAccounts.map((m) => m.player_id));
  // 아직 계정이 연결 안 된 선수만 고를 수 있다. 고정 멤버 먼저.
  const linkable = allPlayers
    .filter((p) => !linked.has(p.id))
    .sort((a, b) => Number(a.membership !== "regular") - Number(b.membership !== "regular"))
    .map((p) => ({ id: p.id, label: `${p.jersey_number != null ? `${p.jersey_number} ` : ""}${p.name}${p.membership === "guest" ? " (용병)" : ""}` }));

  return (
    <main className="space-y-4 pt-6">
      <BackLink href="/coach">홈</BackLink>
      <h1 className="text-2xl font-bold">팀원 관리</h1>
      <ul className="space-y-1 text-sm text-muted">
        <li>· 선수: 명단의 선수와 연결하면 내 기록을 보고 경기마다 기록 노트를 써요. 기록은 못 고쳐요.</li>
        <li>· 기록원: 경기 만들기, 출석, 골·실점 기록과 고치기. 삭제, 명단, 메모·MVP, 공유 링크는 감독만 해요.</li>
      </ul>

      <section className="card p-4">
        <h2 className="font-semibold">
          승인 대기 <span className="text-pitch">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            새 신청이 없어요. 선수는 로그인 화면의 &lsquo;선수 가입&rsquo;, 기록원은 로그인 버튼 아래 &lsquo;기록원 신청&rsquo;으로 가입해요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {pending.map((m) => (
              <li key={m.user_id} className="py-3">
                <p className="font-medium">
                  {m.display_name}{" "}
                  <span className="rounded-full bg-pitch-soft px-2 py-0.5 text-xs font-semibold text-pitch">
                    {m.wants === "player" ? "선수" : "기록원"} 신청
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {m.email} · {dateFmt.format(new Date(m.requested_at))} 신청
                </p>
                <MemberButtons
                  userId={m.user_id}
                  name={m.display_name}
                  kind="pending"
                  wants={m.wants === "player" ? "player" : "recorder"}
                  linkable={linkable}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">
          선수 계정 <span className="text-pitch">{playerAccounts.length}</span>
        </h2>
        {playerAccounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 연결된 선수 계정이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {playerAccounts.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {playerName.get(m.player_id ?? "") ?? "(보관된 선수)"}
                    {m.display_name !== playerName.get(m.player_id ?? "") && (
                      <span className="font-normal text-muted"> · {m.display_name}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </span>
                <MemberButtons userId={m.user_id} name={m.display_name} kind="player" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">
          기록원 <span className="text-pitch">{recorders.length}</span>
        </h2>
        {recorders.length === 0 ? (
          <p className="mt-2 text-sm text-muted">아직 기록원이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {recorders.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.display_name}</span>
                  <span className="block truncate text-xs text-muted">
                    {m.email}
                    {m.approved_at ? ` · ${dateFmt.format(new Date(m.approved_at))} 승인` : ""}
                  </span>
                </span>
                <MemberButtons userId={m.user_id} name={m.display_name} kind="recorder" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
