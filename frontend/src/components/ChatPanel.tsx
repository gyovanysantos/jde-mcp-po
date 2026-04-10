import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Bot, User } from "lucide-react";
import { sendChatMessage, type ChatMessage } from "../lib/api";

interface ChatPanelProps {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);

    setLoading(true);
    try {
      const reply = await sendChatMessage(text, messages);
      setMessages([...updatedHistory, reply]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col
                    border-l bg-white shadow-2xl">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">JDE AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <Bot className="h-12 w-12" />
            <p className="text-sm text-center">
              Ask me about purchase orders, approvals, suppliers, or procurement
              processes.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 mt-1">
                <div className="rounded-full bg-primary/10 p-1.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
            )}
            <div
              className={`rounded-xl px-4 py-2.5 text-sm max-w-[85%] ${
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 mt-1">
                <div className="rounded-full bg-gray-200 p-1.5">
                  <User className="h-3.5 w-3.5 text-gray-600" />
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="rounded-full bg-primary/10 p-1.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
            <div className="rounded-xl bg-gray-100 px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about POs, approvals, suppliers..."
            disabled={loading}
            className="flex-1 rounded-lg border px-3 py-2 text-sm
                       focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary
                       disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-primary px-3 py-2 text-white
                       hover:bg-primary-dark disabled:opacity-50
                       transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
