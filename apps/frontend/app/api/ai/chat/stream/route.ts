import { NextRequest } from 'next/server';
import { GoogleGenerativeAI, type GenerateContentStreamResult } from '@google/generative-ai';

// Streaming API route using Gemini streaming
const MODEL_NAME = 'gemini-1.5-flash';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), { status: 500 });
    }
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages must be an array' }), { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const systemIntro = `あなたは動画編集支援AIです。タイムライン最適化、ショート抽出、無音検出、Bロール提案などを行う。`;    
    const historyText = messages.slice(0, -1).map((m: any) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n');
    const latest = messages[messages.length - 1];
    const prompt = `${systemIntro}\nこれまで:\n${historyText}\n---\nユーザー最新:\n${latest.content}\n\n出力は日本語。段階的に候補を提示し、重要語には*...*で軽い強調。`;

    const streamResult: GenerateContentStreamResult = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err: any) {
          controller.error(err);
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), { status: 500 });
  }
}
