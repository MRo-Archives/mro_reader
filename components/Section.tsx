"use client";
import { useCallback } from "react";
import { Copy } from "lucide-react";
export default function Section({
  title, children, onCopy,
}: { title: string; children: React.ReactNode; onCopy?: () => void }) {
  const handle = useCallback(() => onCopy?.(), [onCopy]);
  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {onCopy && (
          <button onClick={handle}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <Copy size={14} /> コピー
          </button>
        )}
      </div>
      <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}