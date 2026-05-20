"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const INITIAL_GREETING: Message = {
  role: "assistant",
  content:
    "Hi — I'm the TomorrowsTech AI assistant. Ask me about command centers, websites, custom AI workflows, or anything else we build. I'll point you in the right direction.",
};

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Exclude the initial greeting from what we send to the API
      const apiMessages = newMessages.filter(
        (m) => m !== INITIAL_GREETING
      );

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setError("Couldn't reach the chat service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function renderMessageContent(content: string) {
    // Render simple markdown links: [text](/path) or [text](https://...)
    const parts: (string | { text: string; href: string })[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      parts.push({ text: match[1], href: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    return parts.map((part, i) =>
      typeof part === "string" ? (
        <span key={i}>{part}</span>
      ) : (
        <a
          key={i}
          href={part.href}
          target={part.href.startsWith("http") ? "_blank" : undefined}
          rel={part.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="text-[color:var(--color-cyan)] underline hover:opacity-80"
        >
          {part.text}
        </a>
      )
    );
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[color:var(--color-cyan)] text-black shadow-[0_0_20px_rgba(0,217,255,0.4)] hover:shadow-[0_0_30px_rgba(0,217,255,0.6)] transition-shadow flex items-center justify-center font-mono text-xs tracking-widest"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-8rem))] bg-[color:var(--color-bg)] border border-[color:var(--color-cyan-deep)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[color:var(--color-border)] flex items-center justify-between bg-[color:var(--color-surface)]/40">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-[color:var(--color-cyan)] animate-pulse"></span>
                <span className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase">
                  TomorrowsTech AI · Live
                </span>
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)] font-mono">
                Powered by Claude
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] text-sm bg-[color:var(--color-cyan-deep)]/30 border border-[color:var(--color-cyan)]/30 rounded-lg px-3 py-2 text-[color:var(--color-text)]"
                    : "max-w-[90%] text-sm text-[color:var(--color-text-secondary)] leading-relaxed"
                }
              >
                {renderMessageContent(m.content)}
              </div>
            ))}
            {isLoading && (
              <div className="text-sm text-[color:var(--color-text-muted)] font-mono">
                <span className="inline-block animate-pulse">●●●</span>
              </div>
            )}
            {error && (
              <div className="text-sm text-red-400 font-mono">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="px-5 py-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about our services..."
              maxLength={2000}
              disabled={isLoading}
              className="flex-1 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-cyan)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-3 py-2 bg-[color:var(--color-cyan)] text-black text-sm font-medium rounded hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
