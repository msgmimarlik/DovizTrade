import { useState } from "react";

export interface OnlineUser {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  lastSeen?: string;
  hasConversation: boolean;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export const mockOnlineUsers: OnlineUser[] = [
  { id: "1", name: "Ahmet K.", avatar: "AK", isOnline: true, hasConversation: true, lastMessage: "Kuru konuşalım mı?", lastMessageTime: "2 dk önce", unreadCount: 2 },
  { id: "2", name: "Elif Y.", avatar: "EY", isOnline: true, hasConversation: true, lastMessage: "Tamam, anlaştık.", lastMessageTime: "15 dk önce" },
  { id: "3", name: "Mehmet S.", avatar: "MS", isOnline: true, hasConversation: false },
  { id: "4", name: "Fatma D.", avatar: "FD", isOnline: true, hasConversation: false },
  { id: "5", name: "Can B.", avatar: "CB", isOnline: false, lastSeen: "10 dk önce", hasConversation: true, lastMessage: "Yarın görüşelim", lastMessageTime: "1 saat önce" },
  { id: "6", name: "Zeynep A.", avatar: "ZA", isOnline: true, hasConversation: false },
  { id: "7", name: "Hasan T.", avatar: "HT", isOnline: false, lastSeen: "30 dk önce", hasConversation: false },
  { id: "8", name: "Ali R.", avatar: "AR", isOnline: true, hasConversation: false },
  { id: "9", name: "Ayşe M.", avatar: "AM", isOnline: true, hasConversation: false },
  { id: "10", name: "Burak Ö.", avatar: "BÖ", isOnline: false, lastSeen: "1 saat önce", hasConversation: false },
];

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  time: string;
  isMine: boolean;
}

export const mockChats: Record<string, ChatMessage[]> = {
  "1": [
    { id: "m1", senderId: "1", text: "Merhaba, 5000 USD ilanınız hâlâ geçerli mi?", time: "14:20", isMine: false },
    { id: "m2", senderId: "me", text: "Evet, geçerli. Kur 38.50'den satıyorum.", time: "14:22", isMine: true },
    { id: "m3", senderId: "1", text: "Kuru konuşalım mı?", time: "14:25", isMine: false },
  ],
  "2": [
    { id: "m4", senderId: "me", text: "Euro ilanınız için yazıyorum.", time: "13:00", isMine: true },
    { id: "m5", senderId: "2", text: "Buyurun, 3000 EUR satılık.", time: "13:05", isMine: false },
    { id: "m6", senderId: "me", text: "41.10'dan alabilir miyim?", time: "13:10", isMine: true },
    { id: "m7", senderId: "2", text: "Tamam, anlaştık.", time: "13:15", isMine: false },
  ],
  "5": [
    { id: "m8", senderId: "5", text: "10.000 USD'lik ilan için yazıyorum.", time: "11:00", isMine: false },
    { id: "m9", senderId: "me", text: "Buyurun, dinliyorum.", time: "11:05", isMine: true },
    { id: "m10", senderId: "5", text: "Yarın görüşelim", time: "11:10", isMine: false },
  ],
};
