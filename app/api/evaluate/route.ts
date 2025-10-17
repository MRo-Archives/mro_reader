// /app/api/evaluate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
const MODEL = "gpt-5-nano"; // 固定でnano（コスト安定）
type SpeedMode = "quick" | "deep";
const OUTPUT_BUDGET: Record<SpeedMode, { maxOut: number; sumLen: number; resLen: number; maxItems: number; maxChars: number; }> = {
  quick: { maxOut: 1024, sumLen: 120, resLen: 120, maxItems: 1, maxChars: 1000 },
  deep:  { maxOut: 3072, sumLen: 200, resLen: 200, maxItems: 3, maxChars: 3000 },
};
// —— スタイル規範：文末・視点・語彙・禁止表現をガチ縛り
const STYLE_RULES: Record<string, string> = {
  human: [
    "・語尾は「です／ます」。断定調で簡潔に。",
    "・1文は40字以内を目安。具体名詞を使い、抽象語は避ける。",
    "・比喩は原則禁止。婉曲表現（〜かもしれない、〜だと思う）を使わない。",
    "・禁止: 「〜と感じました」「〜のように思います」「抽象的」など評価語の言い換えだけ。"
  ].join("\n"),
  critic: [
    "・語尾は「〜である」。批評語彙（構図／焦点／因果／統一感／語りの視点）を用いる。",
    "・1文は60字以内可。理由→根拠→効果の順で述べる（三段論法）。",
    "・主語は文章要素（語り手／描写／リズム）に置く。作者や読者を主語にしない。",
    "・禁止: 「良いと思う／好き」等の主観語、絵文字、感嘆符。"
  ].join("\n"),
  gentle: [
    "・語尾は「ですね／ましょう」。先に長所→次に提案の順番を徹底。",
    "・1文30〜45字。読者の努力を肯定する語を入れる（たとえば／特に）。",
    "・改善は命令禁止。「〜にすると伝わりやすいかもしれません」は可。",
    "・禁止: 否定形の連発、断定的な否定（〜は悪い／だめ）。"
  ].join("\n"),
};
// —— スタイル別の参考出力（few-shot：極小）
//   ※実データに依存しない“形の例”だけを見せることで、調子を固定
const STYLE_EXAMPLE: Record<string, string> = {
  human: JSON.stringify({
    summary: "場面の要点を具体的に120字前後で述べる。",
    strengths: ["具体名詞で描写が明確。"],
    improvements: ["主語と視点を固定すると読みやすい。"],
    resonance: "出来事→心情→余韻の順に120字前後で簡潔にまとめる。",
    scores: { tempo: 3, structure: 4, emotion: 3, style: 4, impression: 3 }
  }, null, 0),
  critic: JSON.stringify({
    summary: "構図と因果を特定し、要点を論旨先行で述べる。",
    strengths: ["叙述の焦点が明確で、因果の導線が通っている。"],
    improvements: ["視点移動の規律を強めると統一感が増す。"],
    resonance: "主題の核を命題化し、記述の効果を分析的に記す（約200字）。",
    scores: { tempo: 3, structure: 5, emotion: 3, style: 4, impression: 4 }
  }, null, 0),
  gentle: JSON.stringify({
    summary: "良かった点を中心に、やわらかく全体像を伝える。",
    strengths: ["情景の温度感が伝わり、読み手が入りやすい。"],
    improvements: ["会話間に地の文を挟むと感情が伝わりやすいかもしれません。"],
    resonance: "今の良さを保ちながら、次の一歩を具体的にそっと示す（約200字）。",
    scores: { tempo: 3, structure: 3, emotion: 5, style: 4, impression: 4 }
  }, null, 0),
};
const STYLE_TAGLINE: Record<string, string> = {
  human: "Plain & Concrete / 具体・簡潔・断定",
  critic: "Analytical & Structural / 分析・構造・命題",
  gentle: "Supportive & Encouraging / 肯定・提案・やわらかさ",
};
function normalizeInput(s: string) {
  return s
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function safeParseJSON(s: string | null | undefined): any | null {
  if (!s) return null;
  let t = s.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m) t = m[1].trim();
  try { return JSON.parse(t); } catch { return null; }
}
// Responses API（nano）で出力を安定取得
function extractTextFromResponses(resp: any): string {
  if (!resp) return "";
  if (typeof resp.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();
  try {
    const outs = resp.output ?? [];
    const buf: string[] = [];
    for (const item of outs) {
      const mc = item?.message?.content;
      if (Array.isArray(mc)) for (const c of mc) if (typeof c?.text === "string") buf.push(c.text);
      const cc = item?.content;
      if (Array.isArray(cc)) for (const c of cc) if (typeof c?.text === "string") buf.push(c.text);
      if (typeof item?.summary === "string") buf.push(item.summary);
    }
    return buf.join("\n").trim();
  } catch { return ""; }
}
export async function POST(req: Request) {
  try {
    const { text, style = "human", customPrompt = "", speed = "quick" } = await req.json() as {
      text: string; style?: keyof typeof STYLE_RULES; customPrompt?: string; speed?: SpeedMode;
    };
    if (!text?.trim()) return NextResponse.json({ ok:false, error:"NO_TEXT" }, { status:400 });
    const budget = OUTPUT_BUDGET[speed] ?? OUTPUT_BUDGET.quick;
    const inputText = normalizeInput(text).slice(0, budget.maxChars);
    const hint = (customPrompt ?? "").toString().slice(0, 50);
    const rule = STYLE_RULES[style] ?? STYLE_RULES.human;
    const example = STYLE_EXAMPLE[style] ?? STYLE_EXAMPLE.human;
    const tagline = STYLE_TAGLINE[style] ?? STYLE_TAGLINE.human;
    // —— SYSTEM相当：スタイル規範＋NG＋例を明示
    const header = [
      "あなたは日本語の文芸評価アシスタントです。",
      `【読響スタイル】${style}  /  ${tagline}`,
      "【スタイル規範】",
      rule,
      "【補足】以下の参考JSONの“調子”を踏襲しつつ、内容は入力本文に合わせて完全に作り直すこと。",
      "・出力はJSONのみ（コードブロック不可）。",
      "・各項目は1文ずつ。過度な比喩・感嘆符・絵文字は禁止。",
      "・禁止語（例）: 「〜と思います」「〜な気がします」「抽象的」「エモい」「優れていると言えるでしょう」",
      "・日本語で出力すること。"
    ].join("\n");
    const schema = {
      summary: `${budget.sumLen}字程度の要約`,
      strengths: Array.from({ length: budget.maxItems }, () => "1文"),
      improvements: Array.from({ length: budget.maxItems }, () => "1文"),
      resonance: `${budget.resLen}字程度の総評`,
      scores: { tempo: "1-5", structure: "1-5", emotion: "1-5", style: "1-5", impression: "1-5" }
    };
    const prompt = [
      header,
      "",
      "【参考JSON（文体の例・内容はダミー）】",
      example,
      "",
      "【本文】",
      inputText,
      "",
      `【ユーザーの希望（最大50字）】${hint || "特になし"}`,
      "",
      "【この本文に対する最終出力：以下のJSON構造だけを返す】",
      JSON.stringify(schema, null, 2),
      "",
      "※JSON以外の文字列は出力しないこと。"
    ].join("\n");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    // nanoで「推論を抑えて純テキスト出力」を強制
    const resp = await openai.responses.create({
      model: MODEL,
      input: prompt,
      max_output_tokens: budget.maxOut,
      reasoning: { effort: "low" },
      tool_choice: "none",
      text: { format: { type: "text" } },
      store: false
    });
    let raw = extractTextFromResponses(resp);
    let parsed = safeParseJSON(raw);
    // 失敗時は chat.completions（nanoのまま）で一度だけ救済
    if (!parsed) {
      const comp = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: header },
          { role: "user", content: [
              "【参考JSON（文体の例・内容はダミー）】",
              example,
              "",
              "【本文】",
              inputText,
              "",
              `【ユーザーの希望（最大50字）】${hint || "特になし"}`,
              "",
              "【この本文に対する最終出力：以下のJSON構造だけを返す】",
              JSON.stringify(schema, null, 2),
              "",
              "※JSON以外の文字列は出力しないこと。"
            ].join("\n")
          }
        ],
        max_completion_tokens: budget.maxOut
      });
      raw = comp.choices?.[0]?.message?.content ?? raw;
      parsed = safeParseJSON(raw);
    }
    const pick = (arr: any[], n: number) => Array.isArray(arr) ? arr.slice(0,n) : [];
    const fallbackScores = { tempo:3, structure:3, emotion:3, style:3, impression:3 };
    const result = parsed && typeof parsed === "object"
      ? {
          summary: parsed.summary ?? "（要約なし）",
          strengths: pick(parsed.strengths, OUTPUT_BUDGET[speed].maxItems),
          improvements: pick(parsed.improvements, OUTPUT_BUDGET[speed].maxItems),
          resonance: parsed.resonance ?? "",
          scores: parsed.scores ?? fallbackScores
        }
      : {
          summary: "（要約なし）",
          strengths: [],
          improvements: [],
          resonance: "",
          scores: fallbackScores
        };
    return NextResponse.json({
      ok: true,
      modelUsed: MODEL,
      mode: speed,
      style,
      inputChars: inputText.length,
      raw,
      result
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? "ERROR" }, { status:500 });
  }
}