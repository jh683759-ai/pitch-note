import Link from "next/link";
import { InstallApp } from "@/components/install-app";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold text-pitch">pitch-note</p>
      <h1 className="mt-2 text-3xl leading-tight font-bold">
        많이 모으고,
        <br />
        지금 필요한 것만 본다.
      </h1>
      <p className="mt-4 text-muted">
        아마추어 풋살팀 감독을 위한 경기 기록. 경기 후 5분 입력으로 득점 유형, 실점 원인, 코트 위 라인 조합까지 남기고, 화면에는 지금 상황과
        다음 할 일만 보여줍니다.
      </p>
      <Link href="/login" className="btn-primary mt-8">
        팀 로그인
      </Link>
      <InstallApp variant="button" />
    </main>
  );
}
