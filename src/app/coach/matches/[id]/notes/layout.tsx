import { requireCoach } from "@/lib/role";

// 경기 메모·MVP는 감독만 쓴다
export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return children;
}
