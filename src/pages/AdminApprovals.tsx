import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api";

type PendingRegistration = {
  id: number;
  office_name?: string;
  full_name?: string;
  username: string;
  email: string;
  phone?: string;
  gsm?: string;
  city?: string;
  district?: string;
  address?: string;
  created_at?: string;
};

type StoredUser = {
  id: number;
  full_name?: string;
  office_name?: string;
  username?: string;
  email: string;
  phone?: string;
  gsm?: string;
  city?: string;
  district?: string;
  address?: string;
  role?: "admin" | "user";
  is_active?: boolean;
};

type ProfileUpdateChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

type PendingProfileUpdate = {
  id: number;
  user_id: number;
  full_name?: string;
  office_name?: string;
  email?: string;
  created_at?: string;
  changes: ProfileUpdateChange[];
};

type AdminGeneralChatLog = {
  id: string;
  userId: number | null;
  userName: string;
  text: string;
  sentAt: string;
};

type AdminPrivateChatLog = {
  id: string;
  fromId: string;
  toId: string;
  fromName: string | null;
  text: string;
  sentAt: string;
};

const PROFILE_FIELD_LABELS: Record<string, string> = {
  full_name: "Yetkili",
  office_name: "Buro Adi",
  phone: "Telefon",
  gsm: "GSM",
  city: "Il",
  district: "Ilce",
  address: "Adres",
};

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingRegistration[]>([]);
  const [pendingProfileUpdates, setPendingProfileUpdates] = useState<PendingProfileUpdate[]>([]);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [generalChatLogs, setGeneralChatLogs] = useState<AdminGeneralChatLog[]>([]);
  const [privateChatLogs, setPrivateChatLogs] = useState<AdminPrivateChatLog[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatUserFilter, setChatUserFilter] = useState("all");
  const [chatDateFilter, setChatDateFilter] = useState<"all" | "today" | "3days" | "7days">("7days");
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);

  const selectedUserMatches = (value: string) => chatUserFilter === "all" || value === chatUserFilter;

  const dateMatches = (sentAt: string) => {
    if (chatDateFilter === "all") return true;

    const sentDate = new Date(sentAt);
    const now = new Date();

    if (chatDateFilter === "today") {
      return sentDate.toDateString() === now.toDateString();
    }

    const days = chatDateFilter === "3days" ? 3 : 7;
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return sentDate >= threshold;
  };

  const normalizedSearch = chatSearch.trim().toLowerCase();

  const filteredGeneralChatLogs = useMemo(() => {
    return generalChatLogs.filter((item) => {
      if (!dateMatches(item.sentAt)) return false;
      if (!selectedUserMatches(item.userName || "Kullanici")) return false;
      if (!normalizedSearch) return true;

      const haystack = `${item.userName || ""} ${item.text || ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [generalChatLogs, chatDateFilter, chatUserFilter, normalizedSearch]);

  const filteredPrivateChatLogs = useMemo(() => {
    return privateChatLogs.filter((item) => {
      if (!dateMatches(item.sentAt)) return false;
      if (!selectedUserMatches(item.fromName || item.fromId)) return false;
      if (!normalizedSearch) return true;

      const haystack = `${item.fromName || ""} ${item.fromId || ""} ${item.toId || ""} ${item.text || ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [privateChatLogs, chatDateFilter, chatUserFilter, normalizedSearch]);

  const chatUsers = useMemo(() => {
    const names = new Set<string>();
    generalChatLogs.forEach((item) => names.add(item.userName || "Kullanici"));
    privateChatLogs.forEach((item) => names.add(item.fromName || item.fromId));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "tr"));
  }, [generalChatLogs, privateChatLogs]);

  const loadAdminData = async (adminUserId?: number) => {
    const resolvedAdminId = Number(adminUserId || currentUser?.id || 0);

    try {
      const [pendingRes, usersRes, pendingProfileRes, chatArchiveRes] = await Promise.all([
        fetch(apiUrl("/api/admin/pending-users")),
        fetch(apiUrl("/api/admin/users")),
        fetch(apiUrl("/api/admin/profile-update-requests")),
        resolvedAdminId
          ? fetch(apiUrl(`/api/admin/chat-archive?adminUserId=${resolvedAdminId}&days=7`))
          : Promise.resolve(new Response(JSON.stringify({ general: [], private: [] }), { status: 200 })),
      ]);

      if (!pendingRes.ok || !usersRes.ok || !pendingProfileRes.ok || !chatArchiveRes.ok) {
        toast.error("Yonetici verileri alinamadi.");
        return;
      }

      const [pendingData, usersData, profileUpdateData, chatArchiveData] = await Promise.all([
        pendingRes.json(),
        usersRes.json(),
        pendingProfileRes.json(),
        chatArchiveRes.json(),
      ]);
      setPending(Array.isArray(pendingData) ? pendingData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setPendingProfileUpdates(Array.isArray(profileUpdateData) ? profileUpdateData : []);
      setGeneralChatLogs(Array.isArray(chatArchiveData?.general) ? chatArchiveData.general : []);
      setPrivateChatLogs(Array.isArray(chatArchiveData?.private) ? chatArchiveData.private : []);
    } catch {
      toast.error("Yonetici verileri alinirken baglanti hatasi olustu.");
    }
  };

  useEffect(() => {
    const rawCurrentUser = sessionStorage.getItem("currentUser");
    if (!rawCurrentUser) {
      toast.error("Yonetici paneli icin giris yapin.");
      navigate("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(rawCurrentUser) as StoredUser;
      if (parsedUser.role !== "admin") {
        toast.error("Bu sayfaya sadece yonetici erisebilir.");
        navigate("/");
        return;
      }
      setCurrentUser(parsedUser);
      void loadAdminData(parsedUser.id);
    } catch {
      toast.error("Oturum bilgisi okunamadi.");
      navigate("/login");
    }
  }, [navigate]);

  const approveApplication = async (applicationId: number) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/users/${applicationId}/approve`), {
        method: "PATCH",
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Onaylama islemi basarisiz.");
        return;
      }
      toast.success("Basvuru onaylandi ve kullanici aktif edildi.");
      void loadAdminData();
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    }
  };

  const rejectApplication = async (applicationId: number) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/users/${applicationId}`), {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Reddetme islemi basarisiz.");
        return;
      }
      toast.success("Basvuru reddedildi.");
      void loadAdminData();
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    }
  };

  const toggleUserBlock = async (userId: number) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser || targetUser.role === "admin") {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/admin/users/${userId}/active`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !targetUser.is_active }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Guncelleme basarisiz.");
        return;
      }
      toast.success(targetUser.is_active ? "Kullanici engellendi." : "Kullanici engeli kaldirildi.");
      void loadAdminData();
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    }
  };

  const approveProfileUpdate = async (requestId: number) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/profile-update-requests/${requestId}/approve`), {
        method: "PATCH",
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Profil talebi onaylanamadi.");
        return;
      }
      toast.success("Profil degisiklik talebi onaylandi.");
      void loadAdminData();
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    }
  };

  const rejectProfileUpdate = async (requestId: number) => {
    try {
      const response = await fetch(apiUrl(`/api/admin/profile-update-requests/${requestId}/reject`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Profil talebi reddedilemedi.");
        return;
      }
      toast.success("Profil degisiklik talebi reddedildi.");
      void loadAdminData();
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-5xl">
        <Button variant="ghost" className="mb-6 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ana Sayfa
        </Button>

        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Yonetici Onay Paneli</h1>
          <p className="text-sm text-muted-foreground mb-6">Kayit basvurularini inceleyip onaylayin veya reddedin.</p>

          {pending.length === 0 ? (
            <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              Bekleyen kayit basvurusu yok.
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((application) => (
                <div key={application.id} className="rounded-lg border border-border p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <p><strong>Buro Adi:</strong> {application.office_name || "-"}</p>
                    <p><strong>Yetkili:</strong> {application.full_name || "-"}</p>
                    <p><strong>Kullanici Adi:</strong> {application.username}</p>
                    <p><strong>E-posta:</strong> {application.email}</p>
                    <p><strong>Telefon:</strong> {application.phone || "-"}</p>
                    <p><strong>GSM:</strong> {application.gsm || "-"}</p>
                    <p><strong>Il / Ilce:</strong> {application.city || "-"} / {application.district || "-"}</p>
                    <p><strong>Basvuru Tarihi:</strong> {application.created_at ? new Date(application.created_at).toLocaleString("tr-TR") : "-"}</p>
                    <p className="md:col-span-2"><strong>Adres:</strong> {application.address || "-"}</p>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveApplication(application.id)}>
                      <Check className="w-4 h-4 mr-2" /> Onayla
                    </Button>
                    <Button variant="destructive" onClick={() => rejectApplication(application.id)}>
                      <X className="w-4 h-4 mr-2" /> Reddet
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">Profil Degisiklik Talepleri</h2>
            <p className="text-sm text-muted-foreground mb-4">Sadece degisen alanlari gorup onaylayin veya reddedin.</p>

            {pendingProfileUpdates.length === 0 ? (
              <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                Bekleyen profil degisiklik talebi yok.
              </div>
            ) : (
              <div className="space-y-4">
                {pendingProfileUpdates.map((request) => (
                  <div key={request.id} className="rounded-lg border border-border p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                      <p><strong>Buro:</strong> {request.office_name || "-"}</p>
                      <p><strong>Yetkili:</strong> {request.full_name || "-"}</p>
                      <p><strong>E-posta:</strong> {request.email || "-"}</p>
                      <p><strong>Talep Tarihi:</strong> {request.created_at ? new Date(request.created_at).toLocaleString("tr-TR") : "-"}</p>
                    </div>

                    <div className="rounded-md border border-border p-3 space-y-2">
                      {request.changes.map((change, index) => (
                        <div key={`${request.id}-${change.field}-${index}`} className="text-sm">
                          <strong>{PROFILE_FIELD_LABELS[change.field] || change.field}:</strong>{" "}
                          <span className="text-muted-foreground">{change.oldValue || "-"}</span>
                          <span className="mx-2">→</span>
                          <span>{change.newValue || "-"}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveProfileUpdate(request.id)}>
                        <Check className="w-4 h-4 mr-2" /> Onayla
                      </Button>
                      <Button variant="destructive" onClick={() => rejectProfileUpdate(request.id)}>
                        <X className="w-4 h-4 mr-2" /> Reddet
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">Son 7 Gun Mesaj Arsivi</h2>
            <p className="text-sm text-muted-foreground mb-4">00:00'dan sonra sohbet ekrani sifirlansa da yonetici bu kayitlara 7 gun erisebilir.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Mesajlarda ara..."
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              />

              <select
                value={chatUserFilter}
                onChange={(e) => setChatUserFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="all">Tum kullanicilar</option>
                {chatUsers.map((userName) => (
                  <option key={userName} value={userName}>{userName}</option>
                ))}
              </select>

              <select
                value={chatDateFilter}
                onChange={(e) => setChatDateFilter(e.target.value as "all" | "today" | "3days" | "7days")}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="all">Tum zamanlar</option>
                <option value="today">Bugun</option>
                <option value="3days">Son 3 gun</option>
                <option value="7days">Son 7 gun</option>
              </select>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-semibold text-sm mb-3">Genel Sohbet</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredGeneralChatLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Kayit yok.</p>
                  ) : (
                    filteredGeneralChatLogs.slice().reverse().map((item) => (
                      <div key={item.id} className="rounded-md border border-border p-2 text-xs">
                        <p><strong>{item.userName || "Kullanici"}</strong></p>
                        <p className="text-muted-foreground break-words">{item.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.sentAt).toLocaleString("tr-TR")}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="font-semibold text-sm mb-3">Kullanicilar Arasi Mesajlar</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredPrivateChatLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Kayit yok.</p>
                  ) : (
                    filteredPrivateChatLogs.slice().reverse().map((item) => (
                      <div key={item.id} className="rounded-md border border-border p-2 text-xs">
                        <p><strong>{item.fromName || item.fromId}</strong> {"->"} <strong>{item.toId}</strong></p>
                        <p className="text-muted-foreground break-words">{item.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.sentAt).toLocaleString("tr-TR")}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-xl font-bold text-foreground mb-2">Mevcut Kullanicilar</h2>
            <p className="text-sm text-muted-foreground mb-4">Aktif kullanicilari goruntuleyin, gerekli durumda engelleyin veya engeli kaldirin.</p>

            {users.length === 0 ? (
              <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                Sistemde kayitli kullanici yok.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="rounded-lg border border-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-sm">
                      <p><strong>Ad:</strong> {user.full_name || user.username || "-"}</p>
                      <p><strong>E-posta:</strong> {user.email}</p>
                      <p><strong>Lokasyon:</strong> {[user.city, user.district].filter(Boolean).join(" / ") || "-"}</p>
                      <p><strong>Rol:</strong> {user.role === "admin" ? "Yonetici" : "Kullanici"}</p>
                      <p><strong>Durum:</strong> {user.is_active ? "Aktif" : "Engelli"}</p>
                    </div>

                    {user.role === "admin" ? (
                      <Button variant="outline" disabled>
                        Yonetici Engellenemez
                      </Button>
                    ) : (
                      <Button
                        variant={user.is_active ? "destructive" : "default"}
                        className={!user.is_active ? "bg-green-600 hover:bg-green-700 text-white" : undefined}
                        onClick={() => toggleUserBlock(user.id)}
                      >
                        {user.is_active ? "Engelle" : "Engeli Kaldir"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminApprovals;
