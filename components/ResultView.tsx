"use client";
import Section from "./Section";
import ScoreBar from "./ScoreBar";
export type HumanResult = {
  summary: string;
  strengths: string[];
  improvements: string[];
  resonance: string;
  scores: { tempo: number; structure: number; emotion: number; style: number; impression: number };
};
export default function ResultView({
  result,
}: { result: HumanResult | null }) {
  if (!result) return null;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 簡易トースト
      const el = document.createElement("div");
      el.textContent = "コピーしました";
      el.className =
        "fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black text-white text-xs";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    } catch {}
  };
  const { summary, strengths = [], improvements = [], resonance, scores } = result;
  return (
    <div className="grid gap-4">
      <Section title="📚 ストーリー要約" onCopy={() => copy(summary)}>
        <p className="whitespace-pre-wrap">{summary || "（要約なし）"}</p>
      </Section>
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="✨ 良かったところ" onCopy={() => copy(strengths.join("\n"))}>
          <ul className="list-disc pl-5">
            {strengths.length ? strengths.map((s, i) => <li key={i}>{s}</li>) : <li>（特になし）</li>}
          </ul>
        </Section>
        <Section title="✎ 直すと良さそう" onCopy={() => copy(improvements.join("\n"))}>
          <ul className="list-disc pl-5">
            {improvements.length ? improvements.map((s, i) => <li key={i}>{s}</li>) : <li>（特になし）</li>}
          </ul>
        </Section>
      </div>
      <Section title="📝 総評" onCopy={() => copy(resonance)}>
        <p className="whitespace-pre-wrap">{resonance || "（総評なし）"}</p>
      </Section>
      <Section title="📊 スコア">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <ScoreBar label="テンポ" value={scores?.tempo ?? 3} />
            <ScoreBar label="構成" value={scores?.structure ?? 3} />
            <ScoreBar label="感情" value={scores?.emotion ?? 3} />
            <ScoreBar label="文体" value={scores?.style ?? 3} />
            <ScoreBar label="印象" value={scores?.impression ?? 3} />
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 text-sm">
            <p className="font-medium mb-2">ひとことラベル</p>
            <p>
              {
                (() => {
                  const vals = Object.values(scores ?? {}) as number[];
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 3;
                  if (avg >= 4.5) return "完成度の高い均整派";
                  if (avg >= 4.0) return "構成の整った安定作";
                  if (avg >= 3.5) return "魅力が光る伸び代作";
                  return "素材良好・磨けば化ける";
                })()
              }
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}