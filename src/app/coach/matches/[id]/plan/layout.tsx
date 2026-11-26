import { requireCoach } from "@/lib/role";

// 경기 계획은 감독만 쓴다
export default async function PlanLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return children;
}
