import { formatMatchDate } from "@/lib/matches";
import { getSharedMatch } from "@/lib/share";
import { fallbackOgImage, matchOgImage, OG_SIZE } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "경기 스코어와 MVP";

export default async function Image({ params }: { params: Promise<{ token: string; matchId: string }> }) {
  const { token, matchId } = await params;
  const m = await getSharedMatch(token, matchId).catch(() => null);
  if (!m) return fallbackOgImage();
  return matchOgImage({
    date: formatMatchDate(m.played_on),
    opponent: m.opponent,
    our: m.our_score,
    their: m.their_score,
    mvp: m.mvp?.name ?? null,
    focus: m.notes.find((n) => n.kind === "next_focus")?.body ?? null,
  });
}
