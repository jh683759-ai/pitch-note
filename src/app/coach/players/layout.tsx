import { requireCoach } from "@/lib/role";

// 선수 명단 관리는 감독만 (기록원은 경기 날 용병 추가만 출석 화면에서)
export default async function PlayersLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return children;
}
