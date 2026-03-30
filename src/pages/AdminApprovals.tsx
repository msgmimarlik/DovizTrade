import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
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

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingRegistration[]>([]);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);

  const loadAdminData = async () => {
    try {
      const [pendingRes, usersRes] = await Promise.all([
        fetch(apiUrl("/api/admin/pending-users")),
        fetch(apiUrl("/api/admin/users")),
      ]);

      if (!pendingRes.ok || !usersRes.ok) {
        toast.error("Yonetici verileri alinamadi.");
        return;
      }

      const [pendingData, usersData] = await Promise.all([pendingRes.json(), usersRes.json()]);
      setPending(Array.isArray(pendingData) ? pendingData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
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
      void loadAdminData();
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
