import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import type { OnlineUser } from "@/data/mockUsers";
import ChatDialog from "@/components/ChatDialog";
import { resolveWsUrl } from "@/lib/network";
import { getClientSessionId } from "@/lib/network";

interface ConvoSummary {
  userId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

const getConvoKey = (myId: string) => `doviz_convos_${myId}`;
const CHAT_RESET_MARKER_KEY = "doviz_chat_reset_marker_tr";

const getTrDayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const clearPrivateChatStorageIfNeeded = () => {
  const today = getTrDayKey();
  const marker = localStorage.getItem(CHAT_RESET_MARKER_KEY);
  if (marker === today) return;

  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("chat_msgs_") || key.startsWith("doviz_convos_")) {
      localStorage.removeItem(key);
    }
  });
  localStorage.setItem(CHAT_RESET_MARKER_KEY, today);
};

const Messages = () => {
  const navigate = useNavigate();
  const [chatUser, setChatUser] = useState<OnlineUser | null>(null);
  const [search, setSearch] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [conversations, setConversations] = useState<ConvoSummary[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name?: string; role?: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load current user from sessionStorage
  useEffect(() => {
    clearPrivateChatStorageIfNeeded();
    try {
      const raw = sessionStorage.getItem("currentUser");
      setCurrentUser(raw ? JSON.parse(raw) : null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const loadConversations = () => {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(getConvoKey(String(currentUser.id)));
      setConversations(raw ? JSON.parse(raw) : []);
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [currentUser]);

  // WebSocket for online users
  useEffect(() => {
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let isDisposed = false;

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const sendPresence = (ws: WebSocket) => {
      try {
        const raw = sessionStorage.getItem("currentUser");
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.id) {
            ws.send(JSON.stringify({ type: "user:online", userId: u.id, clientSessionId: getClientSessionId(u.id) }));
          }
        }
      } catch {
        // ignore
      }
    };

    const connect = () => {
      const ws = new WebSocket(resolveWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        sendPresence(ws);
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      ws.onclose = () => {
        clearHeartbeat();
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (!isDisposed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "chat:reset" && (payload.scope === "all" || payload.scope === "private")) {
            clearPrivateChatStorageIfNeeded();
            setConversations([]);
            return;
          }
          if (payload.type === "users:online" && Array.isArray(payload.users)) {
            setOnlineUsers(payload.users);
          }
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      clearHeartbeat();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const filterBySearch = (users: OnlineUser[]) =>
    search ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())) : users;

  // Build conversation users with merged online status
  const conversationUsers: OnlineUser[] = conversations.map((c) => {
    const online = onlineUsers.find((u) => u.id === c.userId);
    return {
      id: c.userId,
      name: c.name,
      avatar: c.avatar,
      isOnline: online?.isOnline ?? false,
      hasConversation: true,
      lastMessage: c.lastMessage,
      lastMessageTime: c.lastMessageTime,
      unreadCount: c.unreadCount,
      officeName: online?.officeName ?? null,
      location: online?.location ?? null,
    };
  });

  // Online users not already in conversations
  const otherUsers = onlineUsers.filter(
    (u) => u.isOnline && !conversations.some((c) => c.userId === u.id)
  );

  const filteredConversations = filterBySearch(conversationUsers);
  const filteredOthers = filterBySearch(otherUsers);

  const handleOpenChat = (user: OnlineUser) => {
    // Clear unread count when opening chat
    if (currentUser) {
      try {
        const key = getConvoKey(String(currentUser.id));
        const convos: ConvoSummary[] = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = convos.findIndex((c) => c.userId === user.id);
        if (idx >= 0 && convos[idx].unreadCount > 0) {
          convos[idx].unreadCount = 0;
          localStorage.setItem(key, JSON.stringify(convos));
        }
      } catch { /* ignore */ }
    }
    setChatUser(user);
  };

  const handleCloseChat = () => {
    setChatUser(null);
    loadConversations(); // Refresh conversation list after chat closes
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button variant="ghost" className="mb-6 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ana Sayfa
        </Button>

        <h1 className="font-display text-2xl font-bold text-foreground mb-4">Mesajlar</h1>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Kullanıcı ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        {filteredConversations.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Mesajlarım</h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {filteredConversations.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleOpenChat(user)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">{user.avatar}</span>
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${user.isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{user.name}</span>
                      <span className="text-[11px] text-muted-foreground">{user.lastMessageTime}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{user.lastMessage}</p>
                  </div>
                  {user.unreadCount && user.unreadCount > 0 ? (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                      {user.unreadCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredOthers.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Çevrimiçi Kullanıcılar</h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {filteredOthers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleOpenChat(user)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">{user.avatar}</span>
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-foreground">{user.name}</span>
                    <p className="text-xs text-muted-foreground">Çevrimiçi</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredConversations.length === 0 && filteredOthers.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p>Çevrimiçi kullanıcı yok.</p>
          </div>
        )}
      </div>

      {chatUser && <ChatDialog user={chatUser} onClose={handleCloseChat} />}
    </div>
  );
};

export default Messages;
