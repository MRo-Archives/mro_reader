"use client";
type Props = { label: string; value: number; max?: number };
export default function ScoreBar({ label, value, max = 5 }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm text-zinc-500">
        <span>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-black/80 dark:bg-white/80 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}