"use client";
import { useState } from "react";
type HumanResult = {
  summary: string;
  strengths: string[];
  improvements: string[];
  resonance: string;
};
export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [human, setHuman] = useState<HumanResult | null>(null);
  const send = async () => {
    setLoading(true);
    setHuman(null);
    try {
      const res = await fetch(`/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHuman(data.result as HumanResult);
    } catch (e: any) {
      alert("エラー: " + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">文章AI読響システム - MRo -</h1>
        <p className="text-gray-600 mb-6">あなたと文章を高め合うAI。</p>
        {/* モード切替は削除（Human固定） */}
        <textarea
          className="w-full h-48 p-3 border border-gray-300 rounded-lg bg-white"
          placeholder="ここに文章を貼り付けてください（〜6000字推奨）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={send}
            disabled={loading || !text.trim()}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-50"
          >
            {loading ? "読響中…" : "読ませる"}
          </button>
          <span className="text-xs text-gray-500">一生懸命読むので少し時間ください</span>
        </div>
        {/* 結果エリア（スコアは非表示） */}
        <div className="mt-8">
          {human && (
            <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
              <h2 className="text-lg font-semibold mb-2">📚 ストーリー要約</h2>
              <p className="whitespace-pre-wrap">{human.summary}</p>
              <h3 className="mt-5 font-semibold">✨ ここが良いと思った部分</h3>
              <ul className="list-disc list-inside">
                {human.strengths?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
              <h3 className="mt-5 font-semibold">✎ 直すと良くなりそうなところ</h3>
              <ul className="list-disc list-inside">
                {human.improvements?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
              <h3 className="mt-5 font-semibold">📜 総評</h3>
              <p className="whitespace-pre-wrap">{human.resonance}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
