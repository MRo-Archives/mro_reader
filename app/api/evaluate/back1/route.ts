// app/api/evaluate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";
const SYSTEM_HUMAN = `
あなたは文章評価AI「読響システム -MRo-」です。以下の文章を、人間にわかりやすく評価してください。
必ず次のJSON形式「のみ」を返してください。余計な前置きや囲み記号（コードブロックなど）は禁止。絵文字はUnicodeのみ許可し、:～:形式は禁止。
{
  "summary": "物語の要旨と文体の温度を3〜5文で",
  "strengths": ["良かった点を最大3項目。各1文。具体語を含める"],
  "improvements": ["改善点を最大3項目。各1文。何をどう直すかを明示"],
  "resonance": "読後に残る余韻や象徴の解釈を1段落",
  "scores": { "tempo": 1, "structure": 1, "emotion": 1, "style": 1, "impression": 1 }
}
`.trim();
function makeInput(text: string): string {
  return [
    SYSTEM_HUMAN,
    "",
    "【作品本文】",
    text,
    "",
    "上の指示に厳密に従い、JSONだけを出力してください。"
  ].join("\n");
}
// SDKのバージョン差異に対応：output_text が無い場合も拾う
function extractTextFromResponse(r: any): string {
  if (!r) return "";
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text;
  // vX: r.output が配列で、各要素に content 配列がある想定
  if (Array.isArray(r.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      // item.content: [{ type: "output_text"|"input_text", text?:{value}, ... }]
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text?.value === "string") parts.push(c.text.value);
          else if (typeof c?.content === "string") parts.push(c.content);
          else if (typeof c?.value === "string") parts.push(c.value);
        }
      }
      if (typeof item?.content === "string") parts.push(item.content);
    }
    const s = parts.join("\n").trim();
    if (s) return s;
  }
  // それ以外の形：可能な限りJSONっぽい部分を拾う
  const fallback = JSON.stringify(r);
  return fallback;
}
function safeParseJSON(raw: string) {
  const t = raw?.trim();
  if (!t) throw new Error("EMPTY");
  // そのまま
  try { return JSON.parse(t); } catch {}
  // ```json ... ``` 抽出
  const m = t.match(/```json\s*([\s\S]+?)```/i);
  if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
  // { ... } の最外を抜く
  const m2 = t.match(/\{[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch {} }
  throw new Error("PARSE_FAIL");
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text: unknown = body?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "文章が入力されていません。" }, { status: 400 });
    }
    const charLen = Array.from(text).length;
    const jar = await cookies();
    const isRegistered = Boolean(jar.get("registered_user"));
    const MODEL = isRegistered ? "gpt-4o-mini" : "gpt-5-nano";
    const MAX_CHARS = isRegistered ? 3000 : 1000;
    if (charLen > MAX_CHARS) {
      return NextResponse.json(
        { error: `文字数が上限（${MAX_CHARS}文字）を超えています。` },
        { status: 400 }
      );
    }
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      project: process.env.OPENAI_PROJECT, // proj_... があれば
    });
    const input = makeInput(text);
    // ---- 第1試行：Responses API（JSONモードは使わず、プロンプトで強制）
    let raw = "";
    let parsed: any | null = null;
    try {
      const r1 = await openai.responses.create({
        model: MODEL,
        input,
        max_output_tokens: 900,
      });
      raw = extractTextFromResponse(r1);
      parsed = safeParseJSON(raw);
    } catch {
      // 続行
    }
    // ---- 第2試行：失敗時にもう一度（軽い揺らぎで回収）
    if (!parsed) {
      const r2 = await openai.responses.create({
        model: MODEL,
        input: input + "\n必ずJSONだけを返して。",
        max_output_tokens: 900,
      });
      raw = extractTextFromResponse(r2) || raw;
      try {
        parsed = safeParseJSON(raw);
      } catch {
        parsed = {
          summary: raw || "（要約なし）",
          strengths: [],
          improvements: [],
          resonance: "",
          scores: { tempo: 3, structure: 3, emotion: 3, style: 3, impression: 3 },
        };
      }
    }
    return NextResponse.json({
      ok: true,
      mode: "human",
      registered: isRegistered,
      modelUsed: MODEL,
      limit: { maxChars: MAX_CHARS, currentChars: charLen },
      raw,        // Networkタブで中身確認可能
      result: parsed,
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return NextResponse.json(
      { error: err?.message ?? "不明なエラーが発生しました。" },
      { status: 500 }
    );
  }
}