"use client";
export default function CharCounter({
  length, max,
}: { length: number; max: number }) {
  const pct = Math.min(100, Math.round((length / max) * 100));
  const danger = length > max;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{length.toLocaleString()} / {max.toLocaleString()} 文字</span>
        {danger && <span className="text-red-600">上限を超えています</span>}
      </div>
      <div className="h-1.5 mt-1 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded ${danger ? "bg-red-500" : "bg-black/80 dark:bg-white/80"}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}