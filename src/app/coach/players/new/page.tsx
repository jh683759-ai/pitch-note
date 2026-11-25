import Link from "next/link";
import { createPlayer } from "../actions";
import { PlayerForm } from "../player-form";

export const metadata = { title: "선수 추가 · pitch-note" };

export default async function NewPlayerPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  return (
    <main className="pt-6">
      <Link href="/coach/players" className="text-sm text-muted">
        ← 선수 목록
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">선수 추가</h1>
      {saved && <p className="mb-4 rounded-xl bg-pitch-soft px-4 py-3 text-sm text-pitch">저장했어요. 다음 선수를 입력하세요.</p>}
      {/* key: 저장 후 한 명 더 → 폼을 새로 그려서 입력값 초기화 */}
      <PlayerForm key={saved ?? "first"} action={createPlayer} submitLabel="저장" allowSaveAndNew />
    </main>
  );
}
