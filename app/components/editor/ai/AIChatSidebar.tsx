"use client";
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
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: crypto.randomUUID(),
    role: "assistant",
    content: "こんにちは！動画編集の指示や改善したい点を入力してください。例えば『このシーンの無音区間探して』『60秒の縦向きハイライトを作って』など。"
  }]);
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 新規メッセージ毎にスクロール
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    // プレースホルダ（thinking）
    const placeholder: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "思考中...", thinking: true };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput("");
    // 疑似LLM応答
    setTimeout(() => {
      setMessages((prev) => prev.map(m => m.id === placeholder.id ? {
        ...m,
        thinking: false,
        content: `（モック応答）『${trimmed.slice(0, 40)}』に基づく提案: \n- ここで無音区間を検出しカット候補を表示予定\n- Bロール挿入ポイント分析（将来実装）\n- 要約生成 / ショート抽出（後続実装）`
      } : m));
    }, 600);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

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
            <span className="px-2 py-0.5 rounded bg-indigo-600/40 text-indigo-200 text-[11px] border border-indigo-500/40">Mock</span>
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
              placeholder="指示を入力（Enterで送信 / Shift+Enterで改行）"
              className="w-full bg-transparent outline-none resize-none p-2 text-[13px] h-24 leading-relaxed text-gray-200 placeholder-gray-500"
            />
            <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-gray-500">
              <span>{input.trim() ? "送信可能" : "入力待ち"}</span>
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
