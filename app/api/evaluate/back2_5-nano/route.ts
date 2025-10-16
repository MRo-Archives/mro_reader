// app/api/evaluate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
const SYSTEM_HUMAN = `
あなたは文章評価AI「読響システム -MRo-」です。以下の文章を、人間にわかりやすく評価してください。
必ず次のJSON形式「のみ」を返してください。前置き・説明・コードブロック（\`\`\`）は禁止。絵文字はUnicodeのみ許可し、:～:形式は禁止。
{
  "summary": "物語の要旨と文体の温度を3〜5文で",
  "strengths": ["良かった点を最大3項目。各1文。具体語を含める"],
  "improvements": ["改善点を最大3項目。各1文。何をどう直すかを明示"],
  "resonance": "読後に残る余韻や象徴の解釈を1段落",
  "scores": { "tempo": 1, "structure": 1, "emotion": 1, "style": 1, "impression": 1 }
}
`.trim();
// JSON文字列を頑強にパース
function safeParseJSON(raw: string) {
  const t = (raw || "").trim();
  if (!t) throw new Error("EMPTY");
  try { return JSON.parse(t); } catch {}
  const m1 = t.match(/```json\s*([\s\S]+?)```/i);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch {} }
  const m2 = t.match(/\{[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch {} }
  throw new Error("PARSE_FAIL");
}
// Responses APIの戻りからテキストを取り出す（SDK差異に対応）
function extractText(r: any): string {
  if (!r) return "";
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  // 一部SDKは r.output 配列に content が入る
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
  // 苦し紛れの最終手段
  return typeof r === "string" ? r : JSON.stringify(r);
}
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "文章が入力されていません。" }, { status: 400 });
    }
    if (Array.from(text).length > 1000) {
      return NextResponse.json({ error: "文字数が上限（1000文字）を超えています。" }, { status: 400 });
    }
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      project: process.env.OPENAI_PROJECT, // proj_...（設定あれば）
    });
    const input = [
      SYSTEM_HUMAN,
      "",
      "【作品本文】",
      text,
      "",
      "上の指示に厳密に従い、JSONだけを出力してください。"
    ].join("\n");
    // ---- 第1試行：nano（Responses API）
    let raw = "";
    let parsed: any | null = null;
    try {
      const r1 = await openai.responses.create({
        model: "gpt-5-nano",
        input,                 // ★ stringで渡すのがポイント
        max_output_tokens: 2000, // ★ Responses APIはこの名前
        reasoning: { effort: "low"} ,
        tool_choice: "none",
        text: { format: { type: "text" } }
      });
      raw = extractText(r1);
      parsed = safeParseJSON(raw);
    } catch {
      // 続行
    }
    // ---- 第2試行：もうひと押し（JSON強要文を追加）
    if (!parsed) {
      const r2 = await openai.responses.create({
        model: "gpt-5-nano",
        input: input + "\n必ずJSON以外を出力しないでください。",
        max_output_tokens: 2000,
        reasoning: { effort: "low"} ,
        tool_choice: "none",
        text: { format: { type: "text" } }

      });
      raw = extractText(r2) || raw;
      try {
        parsed = safeParseJSON(raw);
      } catch {
        parsed = {
          summary: raw || "（要約なし）",
          strengths: [],
          improvements: [],
          resonance: "",
          scores: { tempo: 3, structure: 3, emotion: 3, style: 3, impression: 3 }
        };
      }
    }
    return NextResponse.json({
      ok: true,
      modelUsed: "gpt-5-nano",
      limit: { maxChars: 1000, currentChars: Array.from(text).length },
      raw,
      result: parsed
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return NextResponse.json(
      { error: err?.message ?? "不明なエラーが発生しました。" },
      { status: 500 }
    );
  }
}