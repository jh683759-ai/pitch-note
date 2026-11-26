import { requireCoach } from "@/lib/role";

// 선수용 자료는 감독만 올린다
export default async function ResourcesLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return children;
}
