import { createClient } from "@/lib/supabase/server";
import { requireCoach } from "@/lib/role";
import { BackLink } from "../matches/ui";
import { MemberButtons } from "./member-buttons";

export const metadata = { title: "기록원 관리 · pitch-note" };

const dateFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

export default async function TeamPage() {
  await requireCoach();
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select("*").order("requested_at", { ascending: false });
  if (error) return <p className="mt-8 text-danger">불러오지 못했어요: {error.message}</p>;

  const pending = (data ?? []).filter((m) => m.status === "pending");
  const recorders = (data ?? []).filter((m) => m.status === "recorder");

  return (
    <main className="space-y-4 pt-6">
      <BackLink href="/coach">홈</BackLink>
      <h1 className="text-2xl font-bold">기록원 관리</h1>
      <p className="text-sm text-muted">
        기록원은 경기 만들기, 출석, 골·실점 기록과 고치기를 할 수 있어요. 삭제, 선수 명단, 메모·MVP, 공유 링크는 감독만 해요.
      </p>

      <section className="card p-4">
        <h2 className="font-semibold">
          승인 대기 <span className="text-pitch">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            새 신청이 없어요. 팀원에게 로그인 화면의 &lsquo;기록원 신청&rsquo;으로 가입해 달라고 하세요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {pending.map((m) => (
              <li key={m.user_id} className="py-3">
                <p className="font-medium">{m.display_name}</p>
                <p className="text-xs text-muted">
                  {m.email} · {dateFmt.format(new Date(m.requested_at))} 신청
                </p>
                <MemberButtons userId={m.user_id} name={m.display_name} kind="pending" />
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
