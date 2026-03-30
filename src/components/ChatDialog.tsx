import { useState, useRef, useEffect } from "react";
import { X, Send, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OnlineUser } from "@/data/mockUsers";

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  time: string;
  isMine: boolean;
}

interface ConvoSummary {
  userId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface ChatDialogProps {
  user: OnlineUser;
  onClose: () => void;
}

const getMsgKey = (id1: string, id2: string) => `chat_msgs_${[id1, id2].sort().join("_")}`;
const getConvoKey = (myId: string) => `doviz_convos_${myId}`;

const buildWsUrl = () => {
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const configuredWsUrl = (import.meta.env.VITE_CHAT_WS_URL) as string | undefined;
  const isLocalWsUrl = configuredWsUrl?.includes("localhost") || configuredWsUrl?.includes("127.0.0.1");
  const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return configuredWsUrl && (!isLocalWsUrl || isLocalHost)
    ? configuredWsUrl
    : `${wsProtocol}://${window.location.host}/ws`;
};

const updateConvoSummary = (myId: string, them: OnlineUser, lastMsg: string, time: string, addUnread: boolean) => {
  try {
    const key = getConvoKey(myId);
    const convos: ConvoSummary[] = JSON.parse(localStorage.getItem(key) || "[]");
    const idx = convos.findIndex((c) => c.userId === them.id);
    const updated: ConvoSummary = {
      userId: them.id,
      name: them.name,
      avatar: them.avatar,
      lastMessage: lastMsg,
      lastMessageTime: time,
      unreadCount: addUnread ? ((convos[idx]?.unreadCount || 0) + 1) : 0,
    };
    if (idx >= 0) convos[idx] = updated;
    else convos.unshift(updated);
    localStorage.setItem(key, JSON.stringify(convos));
  } catch { /* ignore */ }
};

const ChatDialog = ({ user, onClose }: ChatDialogProps) => {
  const [currentUser] = useState<{ id: number; name?: string } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("currentUser") || "null"); } catch { return null; }
  });
  const myId = String(currentUser?.id ?? "");
  const theirId = user.id;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!myId) return [];
    try { return JSON.parse(localStorage.getItem(getMsgKey(myId, theirId)) || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist messages to localStorage
  useEffect(() => {
    if (!myId) return;
    localStorage.setItem(getMsgKey(myId, theirId), JSON.stringify(messages));
  }, [messages, myId, theirId]);

  // WebSocket for real-time private messages
  useEffect(() => {
    if (!myId) return;
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "user:online", userId: Number(myId) }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "chat:private" && String(payload.fromId) === String(theirId)) {
          const timeStr = payload.time || new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
          const newMsg: ChatMessage = {
            id: `recv-${Date.now()}`,
            senderId: theirId,
            text: payload.text,
            time: timeStr,
            isMine: false,
          };
          setMessages((prev) => [...prev, newMsg]);
          updateConvoSummary(myId, user, payload.text, timeStr, false);
        }
      } catch { /* ignore */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [myId, theirId]);

  const handleSend = () => {
    if (!input.trim() || !myId) return;
    const timeStr = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const newMsg: ChatMessage = {
      id: `sent-${Date.now()}`,
      senderId: myId,
      text: input.trim(),
      time: timeStr,
      isMine: true,
    };
    setMessages((prev) => [...prev, newMsg]);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "chat:private",
        toId: theirId,
        fromId: myId,
        fromName: currentUser?.name || myId,
        text: input.trim(),
        time: timeStr,
      }));
    }
    updateConvoSummary(myId, user, input.trim(), timeStr, false);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-foreground/30 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md h-[85vh] sm:h-[520px] flex flex-col shadow-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Button variant="ghost" size="icon" className="sm:hidden h-8 w-8" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">{user.avatar}</span>
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${user.isOnline ? "bg-ticker-up" : "bg-muted-foreground/40"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-foreground text-sm">{user.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {user.isOnline ? "Çevrimiçi" : `Son görülme: ${user.lastSeen}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8 text-muted-foreground" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>Henüz mesaj yok.</p>
              <p className="text-xs mt-1">Bir mesaj göndererek sohbeti başlatın.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                  msg.isMine
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}
              >
                <p>{msg.text}</p>
                <p className={`text-[10px] mt-1 ${msg.isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {msg.time}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mesaj yazın..."
            className="flex-1 h-10 rounded-full bg-muted border-0"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatDialog;

