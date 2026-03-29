import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type PendingRegistration = {
  id: number;
  officeName: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  gsm: string;
  city: string;
  district: string;
  address: string;
  password: string;
  createdAt: string;
};

type StoredUser = {
  id: number;
  name: string;
  officeName?: string;
  username?: string;
  email: string;
  password: string;
  phone?: string;
  gsm?: string;
  city?: string;
  district?: string;
  address?: string;
  location: string;
  role?: "admin" | "user";
  isActive?: boolean;
};

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingRegistration[]>([]);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const rawCurrentUser = localStorage.getItem("currentUser");
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
    } catch {
      toast.error("Oturum bilgisi okunamadi.");
      navigate("/login");
      return;
    }
  }, [navigate]);

  useEffect(() => {
    if (!currentUser) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const configuredWsUrl = import.meta.env.VITE_CHAT_WS_URL;
    const isLocalWsUrl = configuredWsUrl?.includes("localhost") || configuredWsUrl?.includes("127.0.0.1");
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const wsUrl = configuredWsUrl && (!isLocalWsUrl || isLocalHost)
      ? configuredWsUrl
      : `${wsProtocol}://${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "admin:approvals:get", role: currentUser.role }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "admin:data") {
          setPending(payload.pendingRegistrations ?? []);
          setUsers(payload.users ?? []);
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onerror = () => {
      toast.error("Yonetici verileri alinarken baglanti hatasi olustu.");
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [currentUser]);

  const approveApplication = (application: PendingRegistration) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Sunucuya baglanilamadi.");
      return;
    }
    ws.send(JSON.stringify({ type: "admin:approve", role: currentUser?.role, applicationId: application.id }));
    toast.success("Basvuru onaylandi ve kullanici aktif edildi.");
  };

  const rejectApplication = (applicationId: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Sunucuya baglanilamadi.");
      return;
    }
    ws.send(JSON.stringify({ type: "admin:reject", role: currentUser?.role, applicationId }));
    toast.success("Basvuru reddedildi.");
  };

  const toggleUserBlock = (userId: number) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser || targetUser.role === "admin") {
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Sunucuya baglanilamadi.");
      return;
    }

    ws.send(JSON.stringify({
      type: "admin:user:set-active",
      role: currentUser?.role,
      userId,
      isActive: !targetUser.isActive,
    }));
    toast.success(targetUser.isActive ? "Kullanici engellendi." : "Kullanici engeli kaldirildi.");
  };

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
                    <p><strong>Buro Adi:</strong> {application.officeName}</p>
                    <p><strong>Yetkili:</strong> {application.name}</p>
                    <p><strong>Kullanici Adi:</strong> {application.username}</p>
                    <p><strong>E-posta:</strong> {application.email}</p>
                    <p><strong>Telefon:</strong> {application.phone}</p>
                    <p><strong>GSM:</strong> {application.gsm}</p>
                    <p><strong>Il / Ilce:</strong> {application.city} / {application.district}</p>
                    <p><strong>Basvuru Tarihi:</strong> {new Date(application.createdAt).toLocaleString("tr-TR")}</p>
                    <p className="md:col-span-2"><strong>Adres:</strong> {application.address}</p>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveApplication(application)}>
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
                      <p><strong>Ad:</strong> {user.name}</p>
                      <p><strong>E-posta:</strong> {user.email}</p>
                      <p><strong>Sifre:</strong> {user.password}</p>
                      <p><strong>Lokasyon:</strong> {user.location}</p>
                      <p><strong>Rol:</strong> {user.role === "admin" ? "Yonetici" : "Kullanici"}</p>
                      <p><strong>Durum:</strong> {user.isActive ? "Aktif" : "Engelli"}</p>
                    </div>

                    {user.role === "admin" ? (
                      <Button variant="outline" disabled>
                        Yonetici Engellenemez
                      </Button>
                    ) : (
                      <Button
                        variant={user.isActive ? "destructive" : "default"}
                        className={!user.isActive ? "bg-green-600 hover:bg-green-700 text-white" : undefined}
                        onClick={() => toggleUserBlock(user.id)}
                      >
                        {user.isActive ? "Engelle" : "Engeli Kaldir"}
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
