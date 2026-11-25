import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionLabel } from "@/lib/players";
import { getSharedPlayer } from "@/lib/share";
import { sharePath } from "@/lib/site";
import { PlayerGrowth } from "@/components/player-growth";
import { ShareBack } from "../../ui";

type Props = { params: Promise<{ token: string; playerId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, playerId } = await params;
  const p = await getSharedPlayer(token, playerId);
  return { title: p ? `${p.name}의 기록 · pitch-note` : "선수 기록 · pitch-note" };
}

// 선수 본인 기록: 다른 선수와 비교·순위 없이 내 흐름만
export default async function SharedPlayerPage({ params }: Props) {
  const { token, playerId } = await params;
  const p = await getSharedPlayer(token, playerId);
  if (!p) notFound();

  return (
    <main>
      <ShareBack token={token} />
      <div className="mt-1 mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pitch-soft text-lg font-bold text-pitch tabular-nums">
          {p.jersey_number ?? "-"}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted">{positionLabel(p.main_position)} · 내 기록</p>
        </div>
      </div>
      <PlayerGrowth
        rows={p.matches.map((r) => ({ ...r, goals: Number(r.goals), assists: Number(r.assists), on_court_for: Number(r.on_court_for) }))}
        coach={false}
        matchHref={(m) => sharePath(token, { match: m })}
      />
    </main>
  );
}
