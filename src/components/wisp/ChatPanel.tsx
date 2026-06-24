import * as React from "react";
import { Send, X } from "lucide-react";
import type { ChatMessage, Peer } from "./types";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 500;

function sanitizeMessageText(text: string): string {
  const stripped = text.replace(/<[^>]*>/g, "");
  return stripped.length > MAX_MESSAGE_LENGTH ? `${stripped.slice(0, MAX_MESSAGE_LENGTH)}...` : stripped;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  self: Peer;
}

export function ChatPanel({ open, onClose, messages, onSend, self }: ChatPanelProps) {
  const [text, setText] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: 9e9 });
  }, [messages, open]);

  React.useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  // group consecutive messages by author
  const groups: ChatMessage[][] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last[0].authorId === m.authorId && !m.system) last.push(m);
    else groups.push([m]);
  }

  return (
    <aside className="w-[300px] shrink-0 border-l border-border bg-surface flex flex-col animate-slide-in-right">
      <header className="h-13 flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold">Chat</span>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
          <X size={16} />
        </button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {groups.map((group, i) => {
          const first = group[0];
          if (first.system) {
            return (
              <div key={first.id} className="text-center text-[11px] italic text-text-tertiary">
                {first.text}
              </div>
            );
          }
          const isSelf = first.authorId === self.id;
          return (
            <div key={i} className={cn("flex gap-2", isSelf && "flex-row-reverse")}>
              <Avatar id={first.authorId} name={first.authorName ?? "?"} size={28} />
              <div className={cn("flex flex-col gap-1 max-w-[220px]", isSelf && "items-end")}>
                <span className="text-[11px] text-text-tertiary">{first.authorName}</span>
                {group.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "px-3 py-1.5 rounded-2xl text-sm break-words",
                      isSelf ? "bg-accent text-primary-foreground" : "bg-surface2",
                    )}
                  >
                    {sanitizeMessageText(m.text)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="p-3 border-t border-border flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
          className="flex-1 rounded-lg bg-surface2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="grid place-items-center h-9 w-9 rounded-lg bg-accent text-primary-foreground hover:bg-accent-hover transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </aside>
  );
}
