"use client";
import { useState } from "react";
import ResultView, { HumanResult } from "@/components/ResultView";
import CharCounter from "@/components/CharCounter";
export default function Page() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const MAX = 1000; // 登録なし想定（登録ありはAPI側で3000に）
  const submit = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "エラーが発生しました");
      setResult(data.result as HumanResult);
    } catch (e: any) {
      setError(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-14">
        {/* ヘッダー */}
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            文章AI 読響システム <span className="opacity-60">- MRo -</span>
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            あなたと文章を高め合うAI
          </p>
        </header>
        {/* 入力 */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ここに本文を貼り付けてください（1000文字まで）"
            rows={8}
            className="w-full bg-transparent outline-none resize-y"
          />
          <CharCounter length={[...text].length} max={MAX} />
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={loading || !text.trim() || [...text].length > MAX}
              className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            >
              {loading ? "評価中…" : "評価する"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
        {/* 結果 */}
        <div className="mt-6">
          <ResultView result={result} />
        </div>
        {/* フッター */}
        <footer className="mt-10 text-xs text-zinc-500">
          © {new Date().getFullYear()} MRo Reader
        </footer>
      </div>
    </main>
  );
}