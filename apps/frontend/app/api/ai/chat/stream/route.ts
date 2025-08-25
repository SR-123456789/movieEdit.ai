import { NextRequest } from 'next/server';
import { GoogleGenerativeAI, type GenerateContentStreamResult } from '@google/generative-ai';

export const runtime = 'nodejs';
const MODEL_NAME = 'gemini-2.5-flash';

type Msg = { role: 'user'|'assistant'|'system'|'tool'; content: string };

const SYSTEM_INSTRUCTION = `あなたは動画編集支援AIです。出力は二段構成で、区切りトークンを厳守してください。
重要: コードブロック（三連バッククォートなど）は絶対に使わない。JSONはそのまま出力すること。

【フェーズA：UIメッセージ（逐次表示用）】
[UI_START]
...ここにUIメッセージ（日本語、装飾・コード・JSON禁止）...
[UI_END]

【フェーズB：編集コマンド（厳密JSON）】
[CMD_JSON_START]
{
  "commands": [
    {
      "type": "cut" | "insert_broll" | "add_captions" | "detect_silence" | "extract_short" | "speed_change" | "volume_adjust",
      "target": { "track": "main" | "audio" | "broll", "start_ms"?: number, "end_ms"?: number ,id?: string},
      "params"?: { [k: string]: any },
      "confidence"?: number
    }
  ]
}
[CMD_JSON_END]

[プロジェクトの情報]
projectStatus:{
  mediaFiles:[
    {
      id:クリップID,
      startTime:クリップのソース開始時間(秒),
      endTime:クリップのソース終了時間(秒)
    }
  ]
}

[command使い方]
- cut:クリップをカットします。
  targetに { id: クリップID }、paramsに { targetTime: カット位置(秒, クリップのソース時間) } を指定してください。
  必ず、startTime < targetTime< endTimeにしてください。
  カットされたクリップは二つに分割され, それぞれのクリップは新しいIDを持ちます。


【制約】
- 不明点は推測しない。分からなければ commands は空配列に。
- UIとJSONの外側に一切の追加出力をしない。`;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return new Response('Missing GEMINI_API_KEY', { status: 500 });
    }
    const { messages, projectState } = await req.json() as { messages: Msg[]; projectState?: any };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response('messages must be a non-empty array', { status: 400 });
    }


    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0] || messages[messages.length - 1];
    const userPrompt = `${lastUser.content}\n[projectState]\n${safeStringify(projectState ?? {}, 2000)}`;

        console.log({ messages, projectState, lastUser, userPrompt });

    const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: SYSTEM_INSTRUCTION });
    const streamResult: GenerateContentStreamResult = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
    }, { signal: req.signal });

    const encoder = new TextEncoder();
  const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          const payload = typeof data === 'string' ? data : JSON.stringify(data);
          const lines = payload.split(/\r?\n/);
          const body = `event: ${event}\n` + lines.map(l => `data: ${l}`).join('\n') + '\n\n';
          controller.enqueue(encoder.encode(body));
        };
        // keep-alive
        const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15000);

  let buf = '';
  let jsonBuf = '';
  type Phase = 'pre' | 'ui' | 'json';
  let phase: Phase = 'pre';
  const UI_START = '[UI_START]';
  const UI_END = '[UI_END]';
  const JSON_START = '[CMD_JSON_START]';

        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text() ?? '';
            if (!text) continue;
            buf += text;

            // Consume buffer according to phase
            while (true) {
              if (phase === 'pre') {
                const s = buf.indexOf(UI_START);
                const e = buf.indexOf(UI_END);
                const j = buf.indexOf(JSON_START);
                if (s !== -1) {
                  buf = buf.slice(s + UI_START.length);
                  phase = 'ui';
                  continue;
                }
                // UI_STARTが無くても、UI_ENDが先に来たら先頭〜UI_ENDまでをUIとして扱う
                if (e !== -1 && (j === -1 || e < j)) {
                  const uiPart = buf.slice(0, e);
                  if (uiPart) send('ui', uiPart);
                  buf = buf.slice(e + UI_END.length);
                  phase = 'json';
                  continue;
                }
                // いきなりJSON開始も許容
                if (j !== -1) {
                  buf = buf.slice(j);
                  phase = 'json';
                  continue;
                }
                break; // more data needed
              }

              if (phase === 'ui') {
                const e = buf.indexOf(UI_END);
                if (e === -1) {
                  // 終了マーカーが分割されるのを防ぐため、末尾にUI_END長-1のガードを残す
                  const guard = UI_END.length - 1;
                  if (buf.length > guard) {
                    const emit = buf.slice(0, buf.length - guard);
                    if (emit) send('ui', emit);
                    buf = buf.slice(buf.length - guard);
                  }
                  break; // wait more
                } else {
                  const uiPart = buf.slice(0, e);
                  if (uiPart) send('ui', uiPart);
                  buf = buf.slice(e + UI_END.length);
                  phase = 'json';
                  // fallthrough to json accumulation in the same tick
                  continue;
                }
              }

              if (phase === 'json') {
                if (buf) {
                  jsonBuf += buf;
                  buf = '';
                }
                break; // wait more
              }
            }
          }

          // Extract JSON
          const sTag = '[CMD_JSON_START]';
          const eTag = '[CMD_JSON_END]';
          const s = jsonBuf.indexOf(sTag);
          const e = jsonBuf.lastIndexOf(eTag);
          if (s >= 0 && e > s) {
            const raw = jsonBuf.slice(s + sTag.length, e).trim();
            try {
              const cleaned = sanitizeFencedJSON(raw);
              const parsed = JSON.parse(cleaned);
              send('commands', parsed);
            } catch (err: any) {
              send('error', { message: 'Invalid JSON from model', raw, detail: err?.message });
            }
          } else {
            send('error', { message: 'Missing command JSON section' });
          }

          send('end', { ok: true });
          clearInterval(heartbeat);
          controller.close();
        } catch (err: any) {
          clearInterval(heartbeat);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err?.message || 'stream error' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), { status: 500 });
  }
}

function sanitizeFencedJSON(s: string): string {
  let t = s.trim();
  // remove code fences ```json ... ``` or ``` ... ```
  t = t.replace(/```[a-zA-Z]*\n?/g, '');
  t = t.replace(/```/g, '');
  t = t.trim();
  // pick innermost json object from first { to last }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t.trim();
}

function safeStringify(obj: any, max = 2000) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? s.slice(0, max) + '…(truncated)' : s;
  } catch {
    return '[unstringifiable]';
  }
}
