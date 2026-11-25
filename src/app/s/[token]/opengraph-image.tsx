import { formatMatchDate } from "@/lib/matches";
import { getSharedOverview } from "@/lib/share";
import { fallbackOgImage, matchOgImage, OG_SIZE } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "지난 경기 스코어와 MVP";

// 팀 링크를 보내면 지난 경기 스코어·MVP가 미리보기로 뜬다
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await getSharedOverview(token).catch(() => null);
  const last = o?.matches[0];
  if (!o || !last) return fallbackOgImage();
  return matchOgImage({
    date: formatMatchDate(last.played_on),
    opponent: last.opponent,
    our: last.our_score,
    their: last.their_score,
    mvp: last.mvp_name,
    focus: o.next_focus[0] ?? null,
  });
}
