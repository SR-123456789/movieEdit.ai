import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 環境変数: GEMINI_API_KEY
const MODEL_NAME = 'gemini-1.5-flash'; // コスト/速度重視。必要ならproへ変更

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), { status: 500 });
    }
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages must be an array' }), { status: 400 });
    }

    console.log(process.env.GEMINI_API_KEY);
    console.log(".env.GEMINI_API_KEY");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // シンプル: user最新をpromptとして投入、それ以前をcontextにまとめる
    const systemIntro = `あなたは動画編集支援AIです。目的: タイムライン最適化, 無音区間検出, Bロール提案, 見どころ抽出, Short生成支援。`;

    const historyText = messages
      .slice(0, -1)
      .map((m: any) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
      .join('\n');
    const latest = messages[messages.length - 1];

    const prompt = `${systemIntro}\nこれまでのやりとり:\n${historyText}\n---\nユーザー最新入力:\n${latest.content}\n\n出力指針: 箇条書きで具体的な編集アクション案を含め、必要ならコード/JSON例。日本語で。`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return new Response(JSON.stringify({ content: text }), { status: 200 });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), { status: 500 });
  }
}
