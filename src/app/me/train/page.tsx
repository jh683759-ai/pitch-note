import { redirect } from "next/navigation";
import { getMyPage } from "@/lib/me";
import { getMyPrep, todayKst } from "@/lib/prep";
import { formatMatchDate } from "@/lib/matches";
import { BackLink } from "@/app/coach/matches/ui";
import { deleteTraining } from "../actions";
import { TrainForm } from "./train-form";

export const metadata = { title: "훈련 기록 · pitch-note" };

// 개인 훈련 기록: 공식 경기 기록이 아니라 나의 준비. 나와 감독님만 본다.
export default async function TrainPage() {
  const [p, prep] = await Promise.all([getMyPage(), getMyPrep()]);
  if (!p || !prep) redirect("/coach");

  return (
    <main className="space-y-4">
      <BackLink href="/me">내 기록</BackLink>
      <div>
        <h1 className="text-xl font-bold">오늘 연습 기록</h1>
        <p className="text-sm text-muted">나와 감독님만 봐요. 경기 기록에는 들어가지 않아요.</p>
      </div>
      <TrainForm focus={p.my_focus} practiced={prep.focus_practiced} today={todayKst()} />
      {prep.recent_trainings.length > 0 && (
        <section className="card px-4">
          <h2 className="pt-3 text-sm font-semibold text-muted">최근 기록</h2>
          <ul className="divide-y divide-line">
            {prep.recent_trainings.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">
                    {formatMatchDate(t.trained_on)}
                    {t.minutes ? ` · ${t.minutes}분` : ""}
                  </span>
                  <span className="block truncate">{t.body ?? "포인트 연습"}</span>
                </span>
                <form action={deleteTraining.bind(null, t.id)}>
                  <button className="min-h-10 px-2 text-xs text-muted">지우기</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
