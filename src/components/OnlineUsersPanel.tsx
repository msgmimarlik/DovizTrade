import { useMemo, useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import type { OnlineUser } from "@/data/mockUsers";

interface OnlineUsersPanelProps {
  users: OnlineUser[];
  onUserClick: (user: OnlineUser) => void;
}

const OnlineUsersPanel = ({ users, onUserClick }: OnlineUsersPanelProps) => {
  const [isOpen, setIsOpen] = useState(true);

  const onlineUsers = useMemo(() => users.filter((u) => u.isOnline), [users]);

  const conversationUsers = onlineUsers
    .filter((u) => u.hasConversation)
    .sort((a, b) => {
      if (a.unreadCount && !b.unreadCount) return -1;
      if (!a.unreadCount && b.unreadCount) return 1;
      return 0;
    });

  const otherOnlineUsers = onlineUsers.filter((u) => !u.hasConversation);

  const onlineCount = onlineUsers.length;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted transition-colors w-full"
      >
        <Users className="w-4 h-4 text-primary" />
        Çevrimiçi Kullanıcılar
        <span className="ml-auto text-xs text-muted-foreground">{onlineCount} çevrimiçi</span>
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-foreground text-sm">Kullanıcılar</h3>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-ticker-up animate-pulse" />
            {onlineCount} çevrimiçi
          </span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Küçült
        </button>
      </div>

      {conversationUsers.length > 0 && (
        <div className="border-b border-border">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Mesajlarım
          </p>
          {conversationUsers.map((user) => (
            <UserRow key={user.id} user={user} onClick={() => onUserClick(user)} showLastMessage />
          ))}
        </div>
      )}

      {otherOnlineUsers.length > 0 && (
        <div className="border-b border-border">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Çevrimiçi
          </p>
          {otherOnlineUsers.map((user) => (
            <UserRow key={user.id} user={user} onClick={() => onUserClick(user)} />
          ))}
        </div>
      )}

      {conversationUsers.length === 0 && otherOnlineUsers.length === 0 && (
        <div className="px-4 py-4 text-xs text-muted-foreground">Çevrimiçi kullanıcı bulunmuyor.</div>
      )}
    </div>
  );
};

interface UserRowProps {
  user: OnlineUser;
  onClick: () => void;
  showLastMessage?: boolean;
}

const UserRow = ({ user, onClick, showLastMessage }: UserRowProps) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
  >
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
        <span className="text-xs font-semibold text-primary">{user.avatar}</span>
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
          user.isOnline ? "bg-ticker-up" : "bg-muted-foreground/40"
        }`}
      />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate">{user.name}</span>
        {user.unreadCount ? (
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {user.unreadCount}
          </span>
        ) : showLastMessage && user.lastMessageTime ? (
          <span className="text-[10px] text-muted-foreground flex-shrink-0">{user.lastMessageTime}</span>
        ) : null}
      </div>
      {showLastMessage && user.lastMessage ? (
        <p className="text-xs text-muted-foreground truncate">{user.lastMessage}</p>
      ) : !user.isOnline && user.lastSeen ? (
        <p className="text-[11px] text-muted-foreground">{user.lastSeen}</p>
      ) : null}
    </div>
  </button>
);

export default OnlineUsersPanel;
