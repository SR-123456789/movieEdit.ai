import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: ".env.local" });

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.gemini_api_key;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY が .env にありません");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const server = new McpServer({
  name: "video-editing-copilot",
  version: "0.1.0",
});

/** 1) 編集提案 (Gemini) */
server.registerTool(
  "propose_edits",
  {
    title: "Propose Edits (Gemini)",
    description:
      "秒数付き文字起こしから編集提案JSONを生成します（Gemini）。",
    // ← ここは z.object ではなく “shape” を渡す
    inputSchema: {
      segments: z.array(
        z.object({
          start: z.number(),
          end: z.number(),
          text: z.string().optional(),
        })
      ),
      goal: z.enum(["shorts", "full"]),
      max_seconds: z.number().optional().default(60),
    }. // ← ここは z.object ではなく “shape” を渡す
  },
  async ({
    segments,
    goal,
    max_seconds = 60,
  }: {
    segments: { start: number; end: number; text?: string }[];
    goal: "shorts" | "full";
    max_seconds?: number;
  }) => {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro" });

    const system = `
あなたは動画編集アシスタントです。必ず有効なJSONだけを返してください。説明文やコードブロックは不要です。
スキーマ:
{
  "edits":{
    "cuts":[{"start":number,"end":number}],
    "subtitles":[{"start":number,"end":number,"text":string}],
    "color":{"preset": string}
  },
  "target":{"goal":"shorts"|"full","max_seconds":number}
}
制約:
- 秒単位（小数可）、start < end。
- goal="shorts" の場合、cuts合計は max_seconds 以下。
- JSON以外の文字は出力しない。
`;
    const user =
      "segments = " +
      JSON.stringify(segments).slice(0, 20000) +
      `\ngoal = "${goal}"\nmax_seconds = ${max_seconds}`;

    // role は不要。string か [{text}] でOK
    const res = await model.generateContent(system + "\n\n" + user);
    const text = res.response.text().trim();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        content: [{ type: "text", text: "Model did not return valid JSON:\n" + text }],
      };
    }

    // 最低限のバリデーション
    const cuts = Array.isArray(json?.edits?.cuts) ? json.edits.cuts : [];
    json.edits = json.edits || {};
    json.edits.cuts = cuts.filter(
      (c: any) =>
        typeof c?.start === "number" &&
        typeof c?.end === "number" &&
        c.start < c.end
    );

    return { content: [{ type: "text", text: JSON.stringify(json) }] };
  }
);

/** 2) 要約 (任意) */
server.registerTool(
  "summarize_segments",
  {
    title: "Summarize Segments (Gemini)",
    description: "セグメント内容を短く要約します（日本語）。",
    inputSchema: {
      segments: z.array(
        z.object({
          start: z.number(),
          end: z.number(),
          text: z.string().optional(),
        })
      ),
      max_tokens: z.number().optional(),
    },
  },
  async ({
    segments,
    max_tokens = 256,
  }: {
    segments: { start: number; end: number; text?: string }[];
    max_tokens?: number;
  }) => {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro" });
    const prompt =
      `以下の文字起こしセグメントを、編集者向けに箇条書きで短く要約してください（最大${max_tokens}トークン目安）。\n` +
      JSON.stringify(segments).slice(0, 20000);
    const res = await model.generateContent(prompt);
    return { content: [{ type: "text", text: res.response.text().trim() }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.log("✅ MCP server (Gemini) running via stdio");
