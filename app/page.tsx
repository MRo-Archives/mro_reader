// app/page.tsx（必要なところだけ追加/置換）
"use client";
import { useEffect, useState } from "react";

// --- 履歴型定義とキー
type EvalResult = {
  summary: string;
  strengths: string[];
  improvements: string[];
  resonance: string;
  scores: { tempo: number; structure: number; emotion: number; style: number; impression: number };
};

type HistoryItem = {
  id: string;
  text: string;
  style: string;
  customPrompt: string;
  result: EvalResult;
  createdAt: number;
};

const HIST_KEY = "mro:history";
const CAP = 3; // 無料(非登録)は3件

export default function Home() {
  const [text, setText] = useState("");
  const [style, setStyle] = useState<"human" | "critic" | "gentle">("human");
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 履歴ロード
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const saveHistory = (item: HistoryItem) => {
    try {
      const next = [item, ...history].slice(0, CAP);
      setHistory(next);
      localStorage.setItem(HIST_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style, customPrompt })
      });
      const data = await r.json();
      if (data?.ok) {
        setResult(data.result);
        // 履歴保存
        const item: HistoryItem = {
          id: crypto.randomUUID(),
          text,
          style,
          customPrompt: (data.customPrompt ?? "").toString(),
          result: data.result,
          createdAt: Date.now()
        };
        saveHistory(item);
      } else {
        alert("評価に失敗しました");
      }
    } catch (e) {
      alert("通信エラー");
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setText(item.text);
    setStyle(item.style as any);
    setCustomPrompt(item.customPrompt);
    setResult(item.result);
  };

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-xl font-semibold">文章AI 読響システム - MRo Reader</h1>

      {/* 入力 */}
      <textarea
        className="w-full h-48 p-3 border rounded"
        placeholder="ここに本文を貼り付け（最大1000字）"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
      />

      {/* 読響スタイル＆希望ポイント */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 text-sm">
          読響スタイル
          <select
            className="w-full mt-1 p-2 border rounded"
            value={style}
            onChange={(e) => setStyle(e.target.value as any)}
          >
            <option value="human">Human（標準）</option>
            <option value="critic">Critic（批評家風）</option>
            <option value="gentle">Gentle（励まし）</option>
          </select>
        </label>

        <label className="flex-1 text-sm">
          こういう所を見てほしい（50字）
          <input
            className="w-full mt-1 p-2 border rounded"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value.slice(0, 50))}
            placeholder="例：感情描写／テンポ／会話の自然さ"
            maxLength={50}
          />
        </label>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !text.trim()}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "読響中…" : "評価する"}
      </button>

      {/* 結果表示 */}
      {result && (
        <section className="border rounded p-4 space-y-2">
          <div className="text-xs opacity-70">
            スタイル: {style} / 希望: {customPrompt || "特になし"}
          </div>
          <h2 className="font-semibold">📚 ストーリー要約</h2>
          <p>{result.summary || "（要約なし）"}</p>

          <h3 className="font-semibold mt-2">✨ 良かったところ</h3>
          <ul className="list-disc pl-5">
            {result.strengths?.length
              ? result.strengths.map((s, i) => <li key={i}>{s}</li>)
              : <li>（なし）</li>}
          </ul>

          <h3 className="font-semibold mt-2">✎ 改善点</h3>
          <ul className="list-disc pl-5">
            {result.improvements?.length
              ? result.improvements.map((s, i) => <li key={i}>{s}</li>)
              : <li>（なし）</li>}
          </ul>

          <h3 className="font-semibold mt-2">🧾 総評</h3>
          <p>{result.resonance || "（総評なし）"}</p>
        </section>
      )}

      {/* 履歴（最大3件） */}
      <section className="border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">🗂 履歴（最新{CAP}件）</h2>
          <button
            className="text-sm underline"
            onClick={() => { localStorage.removeItem(HIST_KEY); setHistory([]); }}
          >
            クリア
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-sm opacity-70 mt-2">まだ履歴はありません。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id} className="p-3 border rounded hover:bg-gray-50">
                <div className="text-xs opacity-70">
                  {new Date(h.createdAt).toLocaleString()} / {h.style} / {h.customPrompt || "希望: なし"}
                </div>
                <div className="truncate text-sm my-1">「{h.text.slice(0, 36)}…」</div>
                <button
                  className="text-sm underline"
                  onClick={() => loadFromHistory(h)}
                >
                  この結果を開く
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 仕様注釈 */}
      <p className="text-xs opacity-60">
        💡 同じ文章でもAIの“読み味”により結果が少し変わることがあります（仕様）。
      </p>
    </main>
  );
}
