"use client";
import { useAppSelector, useAppDispatch, store } from "@/app/store";
import { splitAtCurrentTime, deleteActiveElement, duplicateActiveElement, splitClipByIdAtSourceTime, deleteElementById } from "@/app/store/thunks/editorThunks";
import { setCurrentTime } from "@/app/store/slices/projectSlice";
import React, { useState, useEffect, useRef, KeyboardEvent } from "react";

// Copilot風 AI チャットサイドバー（モック実装）
// ・未接続: 応答はセットタイムアウトのダミー
// ・余計な未実装ボタンは追加しない
// ・Shift+Enterで改行 / Enterで送信
// ・折りたたみ可能 / 自動スクロール / 簡易コードブロック整形

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: boolean; // assistant思考中プレースホルダ
};

const formatMessageParts = (content: string) => {
  // ``` で囲まれた部分をコードブロック表示
  const parts: { type: "code" | "text"; value: string }[] = [];
  const tokens = content.split(/```/);
  tokens.forEach((tk, idx) => {
    if (idx % 2 === 1) {
      parts.push({ type: "code", value: tk.trim() });
    } else if (tk.trim()) {
      parts.push({ type: "text", value: tk });
    }
  });
  return parts;
};

const Avator: React.FC<{ role: ChatMessage["role"]; thinking?: boolean }> = ({ role, thinking }) => {
  const base = "flex items-center justify-center h-7 w-7 rounded-md text-xs font-semibold select-none";
  if (role === "assistant") {
    return <div className={`${base} bg-gradient-to-br from-indigo-500 to-violet-600 text-white`}>{thinking ? "..." : "AI"}</div>;
  }
  return <div className={`${base} bg-gray-600 text-white`}>You</div>;
};

export const AIChatSidebar: React.FC = () => {
  const projectState = useAppSelector((state) => state.projectState);
  const dispatch = useAppDispatch();
  
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: crypto.randomUUID(),
    role: "assistant",
    content: "こんにちは！動画編集の指示や改善したい点を入力してください。例えば『このシーンの無音区間探して』『60秒の縦向きハイライトを作って』など。"
  }]);
  const [input, setInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [continueStreak, setContinueStreak] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 新規メッセージ毎にスクロール
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);

  // commands ルータ: Geminiからのcommand配列を実行
  const applyCommands = async (payload: any) => {
    const cmds: any[] = payload?.commands ?? [];
    for (const cmd of cmds) {
      switch (cmd?.type) {
        case 'cut': {
          const id: string | undefined = cmd?.target?.id;
          const targetTime: any = cmd?.params?.targetTime;
          if (id && targetTime != null && !Number.isNaN(Number(targetTime))) {
            // プロンプト仕様: targetTime は source の秒と扱う
            const sourceSec = Number(targetTime);
            dispatch(splitClipByIdAtSourceTime(id, sourceSec) as any);
            break;
          }
          // フォールバック: start_ms/end_ms が来たらタイムライン時刻に合わせて従来の分割
          let ms: number | undefined = undefined;
          if (cmd?.target?.start_ms != null && !Number.isNaN(cmd.target.start_ms)) ms = Number(cmd.target.start_ms);
          else if (cmd?.target?.end_ms != null && !Number.isNaN(cmd.target.end_ms)) ms = Number(cmd.target.end_ms);
          if (ms != null) dispatch(setCurrentTime(Math.max(0, ms / 1000)));
          dispatch(splitAtCurrentTime());
          break;
        }
        // delete: id指定があれば優先。無ければ delete_active の後方互換を使う
        case 'delete': {
          const id: string | undefined = cmd?.target?.id;
          if (id) {
            dispatch(deleteElementById(id) as any);
          } else {
            dispatch(deleteActiveElement());
          }
          break;
        }
        case 'delete_active': {
          dispatch(deleteActiveElement());
          break;
        }
        case 'duplicate_active':
          dispatch(duplicateActiveElement());
          break;
        default:
          // 未対応コマンドは無視
          break;
      }
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
  const placeholder: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", thinking: true };
    setMessages(prev => [...prev, userMsg, placeholder]);
    setInput("");
    try {
      // 1回分の実行で continue 指示が出たかどうかを保持
      let shouldContinue = false;
      let nextStreak = continueStreak;
  const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          projectState: store.getState().projectState,
          continueNumber: continueStreak
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
  const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();

      // SSEフレームパーサ
      let buffer = '';
      let currentEvent: string | null = null;
      let currentData: string[] = [];
  let uiAccum = '';

      const flushEvent = async () => {
        if (!currentEvent) return;
        const dataStr = currentData.join('\n');
        if (currentEvent === 'ui') {
          uiAccum += dataStr;
          setMessages(prev => prev.map(m => m.id === placeholder.id ? { ...m, thinking: false, content: uiAccum } : m));
        } else if (currentEvent === 'commands') {
          try {
            const parsed = JSON.parse(dataStr);
            await applyCommands(parsed);
            // 継続制御
            const cont = !!parsed?.continue;
            if (cont) {
              shouldContinue = true;
              nextStreak = continueStreak + 1;
            } else {
              shouldContinue = false;
              nextStreak = 0;
            }
          } catch (e) {
            // noop
          }
        } else if (currentEvent === 'error') {
          setMessages(prev => prev.map(m => m.id === placeholder.id ? { ...m, thinking: false, content: `エラー: ${dataStr}` } : m));
        } else if (currentEvent === 'end') {
          // 終了
        }
        currentEvent = null;
        currentData = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // フレーム区切りは空行\n\n
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = frame.split('\n');
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              currentData.push(line.slice(5).trim());
            } // ignore comments ':' and others
          }
          await flushEvent();
        }
      }

      // 応答終了後、継続要求があれば自動で再リクエスト
      if (shouldContinue) {
        // 5回以上連続は確認を挟む
        if (nextStreak >= 5) {
          const ok = typeof window !== 'undefined' ? window.confirm(`AIが${nextStreak}回連続で処理継続を要求しています。続けますか？`) : false;
          if (!ok) {
            setContinueStreak(0);
            return;
          }
        }
        setContinueStreak(nextStreak);
        // 続き用のプレースホルダ
        const followPlaceholder: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", thinking: true };
        setMessages(prev => [...prev, followPlaceholder]);

        // 2回目以降の実行
        const res2 = await fetch('/api/ai/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
            projectState: store.getState().projectState,
            continueNumber: nextStreak
          })
        });
        const reader2 = res2.body?.getReader();
        if (reader2) {
          const decoder2 = new TextDecoder();
          let buffer2 = '';
          let currentEvent2: string | null = null;
          let currentData2: string[] = [];
          let uiAccum2 = '';
          const flush2 = async () => {
            if (!currentEvent2) return;
            const dataStr = currentData2.join('\n');
            if (currentEvent2 === 'ui') {
              uiAccum2 += dataStr;
              setMessages(prev => prev.map(m => m.id === followPlaceholder.id ? { ...m, thinking: false, content: uiAccum2 } : m));
            } else if (currentEvent2 === 'commands') {
              try {
                const parsed = JSON.parse(dataStr);
                await applyCommands(parsed);
                // 継続の連鎖がさらに要求された場合は、次のループに任せる（ここでは打ち切り）
                const cont = !!parsed?.continue;
                if (cont) setContinueStreak(v => v + 1); else setContinueStreak(0);
              } catch {}
            }
            currentEvent2 = null; currentData2 = [];
          };
          while (true) {
            const { done, value } = await reader2.read();
            if (done) break;
            buffer2 += decoder2.decode(value, { stream: true });
            let idx2: number;
            while ((idx2 = buffer2.indexOf('\n\n')) !== -1) {
              const frame = buffer2.slice(0, idx2);
              buffer2 = buffer2.slice(idx2 + 2);
              const lines = frame.split('\n');
              for (const line of lines) {
                if (line.startsWith('event:')) currentEvent2 = line.slice(6).trim();
                else if (line.startsWith('data:')) currentData2.push(line.slice(5).trim());
              }
              await flush2();
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setMessages(prev => prev.map(m => m.id === placeholder.id ? { ...m, thinking: false, content: `エラー: ${e.message}` } : m));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語入力などの変換中(IME)は送信しない
    // Chrome/Edge等: e.nativeEvent.isComposing で検出
    const composing = (e as any)?.nativeEvent?.isComposing || isComposing;
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      send();
    }
  };

  const onCompositionStart = () => setIsComposing(true);
  const onCompositionEnd = () => setIsComposing(false);

  return (
    <>
      {/* 折りたたみトグル */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`fixed top-1/2 right-${collapsed ? "0" : "[320px]"} translate-x-full z-50 bg-gray-800/80 backdrop-blur px-2 py-1 rounded-l text-xs text-gray-200 border border-gray-700 hover:bg-gray-700 transition`}
        aria-label="チャット表示切替"
      >{collapsed ? "AI" : "→"}</button>

      <aside
        className={`fixed top-0 right-0 h-screen bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-950/80 border-l border-gray-800 flex flex-col shadow-xl transition-all duration-300 ${collapsed ? "w-0 opacity-0 pointer-events-none" : "w-[320px]"}`}
      >
        <header className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-gray-800 text-[13px] tracking-wide font-medium text-gray-200">
          <span className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-indigo-600/40 text-indigo-200 text-[11px] border border-indigo-500/40">Gemini</span>
            AI アシスタント
          </span>
        </header>

        <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px] leading-relaxed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700/70">
          {messages.map(msg => (
            <div key={msg.id} className="flex gap-2 items-start">
              <Avator role={msg.role} thinking={msg.thinking} />
              <div className="flex-1 min-w-0">
                {formatMessageParts(msg.content).map((p, i) => p.type === "code" ? (
                  <pre key={i} className="bg-[#101826] border border-gray-700 rounded-md p-2 mt-1 mb-2 overflow-auto text-[12px] leading-snug"><code>{p.value}</code></pre>
                ) : (
                  <p key={i} className="whitespace-pre-wrap text-gray-200">{p.value}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 p-3 bg-gradient-to-b from-gray-900/80 to-gray-950/90">
          <div className="rounded-md border border-gray-700 bg-gray-900 focus-within:border-indigo-500 transition">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              placeholder="指示を入力（Enterで送信 / Shift+Enterで改行）"
              className="w-full bg-transparent outline-none resize-none p-2 text-[13px] h-24 leading-relaxed text-gray-200 placeholder-gray-500"
            />
            <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-gray-500">
              <span>{input.trim() ? "Enterで送信" : "入力待ち"}</span>
              <button
                onClick={send}
                disabled={!input.trim()}
                className="px-3 py-1 rounded bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-medium transition"
              >送信</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AIChatSidebar;
