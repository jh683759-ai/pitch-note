import { ImageResponse } from "next/og";

// 카톡·문자 링크 미리보기 이미지 (1200x630). 스코어와 MVP가 한눈에.
export const OG_SIZE = { width: 1200, height: 630 };

/** 이미지에 들어갈 글자만 담은 한글 폰트를 Google Fonts에서 받는다 (몇 KB). */
async function koreanFont(text: string, weight: 400 | 800) {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { cache: "force-cache" })).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error("폰트를 받지 못했어요");
  return (await fetch(src, { cache: "force-cache" })).arrayBuffer();
}

export type OgMatch = {
  date: string; // "11월 25일 (수)"
  opponent: string;
  our: number;
  their: number;
  mvp: string | null;
  focus?: string | null; // 다음 경기 포인트 1번
};

export async function matchOgImage(m: OgMatch) {
  const result = m.our > m.their ? "승" : m.our < m.their ? "패" : "무";
  const resultBg = result === "승" ? "#0f5132" : result === "패" ? "#b42318" : "#6b726e";
  const opponent = m.opponent.length > 14 ? `${m.opponent.slice(0, 13)}…` : m.opponent;
  const focus = m.focus && m.focus.length > 26 ? `${m.focus.slice(0, 25)}…` : m.focus;

  const bold = `${opponent}${m.our}${m.their}:${result}MVP${m.mvp ?? ""}vs`;
  const regular = `${m.date}pitch-note 우리 팀 기록 다음 경기 포인트${focus ?? ""}`;
  let fonts: { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" }[] = [];
  try {
    const [b, r] = await Promise.all([koreanFont(bold, 800), koreanFont(regular, 400)]);
    fonts = [
      { name: "NotoKR", data: b, weight: 800, style: "normal" },
      { name: "NotoKR", data: r, weight: 400, style: "normal" },
    ];
  } catch {
    // 폰트를 못 받으면 기본 폰트로라도 그린다 (한글이 깨질 수 있음)
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f6f7f5",
          fontFamily: "NotoKR",
          padding: "56px 72px",
          color: "#1b1f1d",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#6b726e" }}>
          <span>pitch-note 우리 팀 기록</span>
          <span>{m.date}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 40, fontSize: 56, fontWeight: 800 }}>
          vs {opponent}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 190, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
            {m.our}:{m.their}
          </span>
          <span
            style={{
              marginLeft: 36,
              background: resultBg,
              color: "white",
              fontSize: 64,
              fontWeight: 800,
              borderRadius: 999,
              padding: "6px 34px",
            }}
          >
            {result}
          </span>
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {m.mvp ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  background: "#0f5132",
                  color: "white",
                  fontSize: 34,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: "4px 22px",
                }}
              >
                MVP
              </span>
              <span style={{ marginLeft: 20, fontSize: 52, fontWeight: 800 }}>{m.mvp}</span>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          {focus && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: 560 }}>
              <span style={{ fontSize: 24, color: "#6b726e" }}>다음 경기 포인트</span>
              <span style={{ fontSize: 32, color: "#0f5132" }}>{focus}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

/** 경기가 없거나 링크가 틀렸을 때 */
export function fallbackOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f5132",
          color: "white",
          fontSize: 80,
          fontWeight: 800,
        }}
      >
        pitch-note
      </div>
    ),
    OG_SIZE,
  );
}
