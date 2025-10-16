import { NextResponse } from "next/server";
import OpenAI from "openai";
/* ---- 厳格プロンプト（JSON強制・短く・具体） ---- */
const SYSTEM = `
あなたは文章評価AI「読響システム -MRo-」です。
以下の文章を読み、指定の JSON **のみ** を返してください。
前置き・説明・コードブロック（\`\`\`）・余計なキー・コメントは禁止。
絵文字は Unicode のみ（:スマイル: などのショートコード不可）。
各配列は最大3件。scoresは1〜5の整数。
`.trim();
const SCHEMA_HINT = `
返すJSONの例（構造とキー名は厳守・値はあなたが埋める）:
{
  "summary": "3〜5文。出来事＋文体の印象を含める。",
  "strengths": [
    "具体的に良かった点を1文で",
    "具体的に良かった点を1文で",
    "具体的に良かった点を1文で"
  ],
  "improvements": [
    "何を・どこを・どう直すかを1文で",
    "何を・どこを・どう直すかを1文で",
    "何を・どこを・どう直すかを1文で"
  ],
  "resonance": "象徴・空気感・余韻の解釈を1段落",
  "scores": { "tempo": 1, "structure": 1, "emotion": 1, "style": 1, "impression": 1 }
}
`.trim();
function makeInput(text: string): string {
  return [
    SYSTEM,
    "",
    "【作品本文】",
    text,
    "",
    SCHEMA_HINT,
    "",
    "注意: JSON以外を一切出力しないこと。キーや構造を追加・省略しないこと。"
  ].join("\n");
}
/* ---- SDK差異を吸収してテキスト抽出 ---- */
function extractText(r: any): string {
  if (!r) return "";
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  if (Array.isArray(r.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text?.value === "string") parts.push(c.text.value);
          else if (typeof c?.value === "string") parts.push(c.value);
          else if (typeof c?.content === "string") parts.push(c.content);
        }
      } else if (typeof content === "string") {
        parts.push(content);
      }
    }
    const s = parts.join("\n").trim();
    if (s) return s;
  }
  // 最後の保険
  return typeof r === "string" ? r : JSON.stringify(r);
}
/* ---- JSONパース（ゆるめ抽出→厳密化） ---- */
function safeParseJSON(raw: string) {
  const t = (raw || "").trim();
  if (!t) throw new Error("EMPTY");
  try { return JSON.parse(t); } catch {}
  const mFence = t.match(/```json\s*([\s\S]+?)```/i);
  if (mFence) { try { return JSON.parse(mFence[1].trim()); } catch {} }
  const mBraces = t.match(/\{[\s\S]*\}/);
  if (mBraces) { try { return JSON.parse(mBraces[0]); } catch {} }
  throw new Error("PARSE_FAIL");
}
/* ---- 結果のバリデーション＆整形（依存なしの軽量実装） ---- */
function normalizeResult(obj: any) {
  const toStr = (v: any) => (typeof v === "string" ? v : (v == null ? "" : String(v)));
  const toArr = (v: any) => (Array.isArray(v) ? v : (v == null ? [] : [v])).slice(0, 3).map(toStr).filter(Boolean);
  const toScore = (n: any) => {
    const x = Math.round(Number(n));
    return Number.isFinite(x) ? Math.min(5, Math.max(1, x)) : 3;
  };
  const out = {
    summary: toStr(obj?.summary),
    strengths: toArr(obj?.strengths),
    improvements: toArr(obj?.improvements),
    resonance: toStr(obj?.resonance),
    scores: {
      tempo: toScore(obj?.scores?.tempo),
      structure: toScore(obj?.scores?.structure),
      emotion: toScore(obj?.scores?.emotion),
      style: toScore(obj?.scores?.style),
      impression: toScore(obj?.scores?.impression),
    },
  };
  // 空っぽならフォールバック
  if (!out.summary && !out.resonance && out.strengths.length === 0 && out.improvements.length === 0) {
    out.summary = "（要約なし）";
  }
  return out;
}
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "文章が入力されていません。" }, { status: 400 });
    }
    const charLen = Array.from(text).length;
    if (charLen > 1000) {
      return NextResponse.json({ error: "文字数が上限（1000文字）を超えています。" }, { status: 400 });
    }
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      project: process.env.OPENAI_PROJECT, // proj_...（設定あれば）
    });
    const input = makeInput(text);
    // ---- 第1試行：推論抑制＋出力枠広め
    let raw = "";
    let parsed: any | null = null;
    let meta: any = null;
    const r1 = await openai.responses.create({
      model: "gpt-5-nano",
      input,
      max_output_tokens: 2048,
      reasoning: { effort: "low" },
      tool_choice: "none",
      text: { format: { type: "text" } },
    });
    raw = extractText(r1);
    meta = r1;
    try {
      parsed = safeParseJSON(raw);
    } catch {
      // JSONでなければ後続へ
    }
    // ---- 出力不足や未完了（max_output_tokens）なら第2試行
    const incomplete = meta?.status === "incomplete" && meta?.incomplete_details?.reason === "max_output_tokens";
    if (!parsed || incomplete || !raw) {
      const r2 = await openai.responses.create({
        model: "gpt-5-nano",
        input: input + "\nJSON以外を一切出力しない。scoresは1〜5の整数。配列は最大3つまで。",
        max_output_tokens: 3072,
        reasoning: { effort: "low" },
        tool_choice: "none",
        text: { format: { type: "text" } },
      });
      raw = extractText(r2) || raw;
      try {
        parsed = safeParseJSON(raw);
      } catch {
        parsed = null;
      }
    }
    const result = parsed ? normalizeResult(parsed) : normalizeResult({ summary: raw });
    return NextResponse.json({
      ok: true,
      modelUsed: "gpt-5-nano",
      limit: { maxChars: 1000, currentChars: charLen },
      raw,         // Networkタブで中身確認可
      result,      // ← フロントはこれをそのまま描画
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return NextResponse.json(
      { error: err?.message ?? "不明なエラーが発生しました。" },
      { status: 500 }
    );
  }
}