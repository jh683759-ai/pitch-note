/** 가입할 때 선수/기록원 고르기. 기본은 선수 (팀원 대부분이 선수라서). */
export function WantsPicker() {
  return (
    <fieldset>
      <legend className="text-sm text-muted">무엇으로 신청할까요?</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Option value="player" title="선수" desc="내 기록 보기, 경기 노트" defaultChecked />
        <Option value="recorder" title="기록원" desc="감독 대신 경기 기록" />
      </div>
    </fieldset>
  );
}

function Option({ value, title, desc, defaultChecked }: { value: string; title: string; desc: string; defaultChecked?: boolean }) {
  return (
    <label className="card flex cursor-pointer flex-col gap-0.5 p-3 has-[:checked]:border-pitch has-[:checked]:bg-pitch-soft">
      <span className="flex items-center gap-2 font-semibold">
        <input type="radio" name="wants" value={value} defaultChecked={defaultChecked} className="accent-pitch" />
        {title}
      </span>
      <span className="text-xs text-muted">{desc}</span>
    </label>
  );
}
