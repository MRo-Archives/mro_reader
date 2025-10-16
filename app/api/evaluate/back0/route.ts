// app/api/evaluate/route.ts
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = "gpt-4o-mini"; // 必要に応じて上位モデルへ
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "text が空です" }, { status: 400 });
    }
    // Humanモード：あらすじ偏重を避け、文体・象徴・余韻も読む。絵文字禁止。スコアなし。
    const systemHuman = `
あなたは「文章AI読響システム -MRo-」のHumanモードです。
作品を“読む”ことで、構造・テンポ（呼吸）・文体・感情の流れ・象徴・余韻を分析し、
初心者にも理解できる具体的な言葉で講評します。
単なるあらすじ列挙は避け、テキストの「どの一文が」「どの効果を生んだか」を短く指摘してください。
絵文字・顔文字・ショートコード（:〜:）は一切使用しないでください。
出力は次のJSONのみ（日本語）。余計なテキストは禁止。
{
  "summary": "物語の要旨と温度を3〜5文で（出来事＋文体の印象を両方含める）",
  "strengths": [
    "良い点を3〜4項目。各1文。具体語（例: セリフ/情景/比喩/間）を必ず含める。"
  ],
  "improvements": [
    "改善提案を3〜5項目。各1文。何を、どこに、どのように直すかを明示。"
  ],
  "resonance": "読後響（1〜2段落）。空気・象徴・余韻の解釈を中心に。"
}
`.trim();
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemHuman },
      { role: "user", content: `【作品本文】\n${text}` },
    ];
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.35,           // Humanはやや抑制
      frequency_penalty: 0.2,
      max_tokens: 900,
      messages,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // 壊れた時の簡易フォールバック
      parsed = {
        summary: content.slice(0, 300),
        strengths: [],
        improvements: [],
        resonance: "",
      };
    }
    return Response.json({ result: parsed });
  } catch (e: any) {
    console.error(e);
    return Response.json(
      { error: "サーバエラー", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
// 動作確認用（GET）
export async function GET() {
  return Response.json({ ok: true, usage: "POST { text } // Human固定" });
}