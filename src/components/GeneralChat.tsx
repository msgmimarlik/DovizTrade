import { useState, useRef, useEffect } from "react";
import { Send, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GeneralChatMessage {
  id: string;
  userName: string;
  avatar: string;
  text: string;
  time: string;
}

type CurrentUser = {
  name?: string;
  role?: "admin" | "user";
};

const initialMessages: GeneralChatMessage[] = [
  { id: "g1", userName: "Ahmet K.", avatar: "AK", text: "Bugün dolar düşer mi sizce?", time: "14:05" },
  { id: "g2", userName: "Elif Y.", avatar: "EY", text: "FED kararı bekleniyor, ona göre hareket ederim.", time: "14:08" },
  { id: "g3", userName: "Mehmet S.", avatar: "MS", text: "Altın 3900'ü görür mü bu hafta?", time: "14:12" },
  { id: "g4", userName: "Fatma D.", avatar: "FD", text: "Sterlin almak isteyenler var mı? İyi kurum var.", time: "14:18" },
  { id: "g5", userName: "Can B.", avatar: "CB", text: "Euro 41'in altına inerse alıcıyım.", time: "14:22" },
  { id: "g6", userName: "Zeynep A.", avatar: "ZA", text: "Herkese iyi akşamlar 👋", time: "14:30" },
];

const GeneralChat = () => {
  const [messages, setMessages] = useState<GeneralChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [menu, setMenu] = useState<{ visible: boolean; x: number; y: number; messageId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    messageId: null,
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const rawUser = sessionStorage.getItem("currentUser");
      if (!rawUser) {
        setIsAdmin(false);
        setCurrentUser(null);
        return;
      }
      const user = JSON.parse(rawUser) as CurrentUser;
      setCurrentUser(user);
      setIsAdmin(user.role === "admin");
    } catch {
      setIsAdmin(false);
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const configuredWsUrl = import.meta.env.VITE_CHAT_WS_URL;
    const isLocalWsUrl = configuredWsUrl?.includes("localhost") || configuredWsUrl?.includes("127.0.0.1");
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const wsUrl = configuredWsUrl && (!isLocalWsUrl || isLocalHost)
      ? configuredWsUrl
      : `${wsProtocol}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => {
      setIsConnected(false);
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "snapshot"; messages: GeneralChatMessage[] }
          | { type: "new"; message: GeneralChatMessage }
          | { type: "deleted"; id: string };

        if (payload.type === "snapshot") {
          setMessages(payload.messages);
        }
        if (payload.type === "new") {
          setMessages((prev) => [...prev, payload.message]);
        }
        if (payload.type === "deleted") {
          setMessages((prev) => prev.filter((msg) => msg.id !== payload.id));
        }
      } catch {
        // Ignore malformed payload.
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const closeMenu = () => setMenu({ visible: false, x: 0, y: 0, messageId: null });
    if (menu.visible) {
      window.addEventListener("click", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
    }

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menu.visible]);

  const handleSend = () => {
    if (!input.trim()) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("Sohbet sunucusuna baglanilamadi.");
      return;
    }

    const displayName = currentUser?.name || "Kullanici";
    const avatar = displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    wsRef.current.send(
      JSON.stringify({
        type: "send",
        userName: displayName,
        avatar,
        text: input.trim(),
      }),
    );

    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, messageId: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    setMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      messageId,
    });
  };

  const handleDeleteMessage = () => {
    if (!menu.messageId) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("Sohbet sunucusuna baglanilamadi.");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "delete",
        id: menu.messageId,
        role: isAdmin ? "admin" : "user",
      }),
    );

    setMenu({ visible: false, x: 0, y: 0, messageId: null });
    toast.success("Mesaj silme talebi gonderildi.");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted transition-colors w-full"
      >
        <Users className="w-4 h-4 text-primary" />
        Genel Sohbet
        <span className="ml-auto text-xs text-muted-foreground">{messages.length} mesaj</span>
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ height: 380 }}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground text-sm">Genel Sohbet</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${isConnected ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-500"}`}>
            {isConnected ? "Canli" : "Bagli degil"}
          </span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Küçült
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => {
          const isMine = msg.userName === (currentUser?.name || "");
          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}
              onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
            >
              {!isMine && (
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-semibold text-primary">{msg.avatar}</span>
                </div>
              )}
              <div className={`max-w-[80%] ${isMine ? "text-right" : ""}`}>
                {!isMine && (
                  <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{msg.userName}</p>
                )}
                <div
                  className={`inline-block px-3 py-1.5 rounded-2xl text-sm ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{msg.time}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-border flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mesaj yazın..."
          className="flex-1 h-9 rounded-full bg-muted border-0 text-sm"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim()}
          className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>

      {menu.visible && isAdmin && (
        <div
          className="fixed z-[120] rounded-md border border-border bg-card shadow-lg p-1"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="px-3 py-1.5 text-sm text-red-500 hover:bg-muted rounded w-full text-left"
            onClick={handleDeleteMessage}
          >
            Mesajı Sil
          </button>
        </div>
      )}
    </div>
  );
};

export default GeneralChat;
