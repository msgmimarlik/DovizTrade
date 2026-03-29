import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    const rawCurrentUser = localStorage.getItem("currentUser");
    if (!rawCurrentUser) {
      toast.error("Yonetici paneli icin giris yapin.");
      navigate("/login");
      return;
    }

    try {
      const currentUser = JSON.parse(rawCurrentUser) as StoredUser;
      if (currentUser.role !== "admin") {
        toast.error("Bu sayfaya sadece yonetici erisebilir.");
        navigate("/");
        return;
      }
    } catch {
      toast.error("Oturum bilgisi okunamadi.");
      navigate("/login");
      return;
    }

    const rawPending = localStorage.getItem("pendingRegistrations");
    const rawUsers = localStorage.getItem("users");
    setPending(rawPending ? JSON.parse(rawPending) : []);
    setUsers(rawUsers ? JSON.parse(rawUsers) : []);
  }, [navigate]);

  const approveApplication = (application: PendingRegistration) => {
    const rawUsers = localStorage.getItem("users");
    const users: StoredUser[] = rawUsers ? JSON.parse(rawUsers) : [];

    const newUser: StoredUser = {
      id: application.id,
      name: application.name,
      officeName: application.officeName,
      username: application.username,
      email: application.email,
      password: application.password,
      phone: application.phone,
      gsm: application.gsm,
      city: application.city,
      district: application.district,
      address: application.address,
      location: `${application.city} / ${application.district}`,
      role: "user",
      isActive: true,
    };

    const updatedUsers = [...users, newUser];
    const updatedPending = pending.filter((p) => p.id !== application.id);

    localStorage.setItem("users", JSON.stringify(updatedUsers));
    localStorage.setItem("pendingRegistrations", JSON.stringify(updatedPending));
    setUsers(updatedUsers);
    setPending(updatedPending);
    toast.success("Basvuru onaylandi ve kullanici aktif edildi.");
  };

  const rejectApplication = (applicationId: number) => {
    const updatedPending = pending.filter((p) => p.id !== applicationId);
    localStorage.setItem("pendingRegistrations", JSON.stringify(updatedPending));
    setPending(updatedPending);
    toast.success("Basvuru reddedildi.");
  };

  const toggleUserBlock = (userId: number) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser || targetUser.role === "admin") {
      return;
    }

    const updatedUsers = users.map((u) => {
      if (u.id !== userId) return u;
      return { ...u, isActive: !u.isActive };
    });

    localStorage.setItem("users", JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
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
