
import { Plus, MessageCircle, User, Menu, History, Moon, Sun, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import MyTransactionsModal, { type MyTransaction } from "@/components/MyTransactionsModal";
import { toast } from "sonner";
import { apiRequest } from "@/lib/network";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CurrentUser = {
  id: number;
  role?: "admin" | "user";
  name?: string;
  full_name?: string;
  officeName?: string;
  office_name?: string;
  username?: string;
  email: string;
  phone?: string;
  gsm?: string;
  city?: string;
  district?: string;
  address?: string;
};

type ProfileFormData = {
  name: string;
  officeName: string;
  phone: string;
  gsm: string;
  city: string;
  district: string;
  address: string;
};

const Navbar = () => {

  const [menuOpen, setMenuOpen] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [myTransactions, setMyTransactions] = useState<MyTransaction[]>([]);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormData>({
    name: "",
    officeName: "",
    phone: "",
    gsm: "",
    city: "",
    district: "",
    address: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const rawUser = sessionStorage.getItem("currentUser");
    if (!rawUser) {
      setCurrentUser(null);
      return;
    }

    try {
      const user = JSON.parse(rawUser);
      setCurrentUser(user);
      setProfileForm({
        name: String(user?.full_name || user?.name || ""),
        officeName: String(user?.office_name || user?.officeName || ""),
        phone: String(user?.phone || ""),
        gsm: String(user?.gsm || ""),
        city: String(user?.city || ""),
        district: String(user?.district || ""),
        address: String(user?.address || ""),
      });
      if (user?.id) {
        const raw = localStorage.getItem(`userTransactions_${user.id}`);
        setMyTransactions(raw ? JSON.parse(raw) : []);
      }
    } catch {
      setCurrentUser(null);
    }
  }, [showTransactions]);

  const handleCreateListingClick = () => {
    if (!currentUser) {
      toast.error("İlan vermek için önce giriş yapın.");
      navigate("/login");
      return;
    }
    navigate("/create-listing");
  };

  const handleLogout = () => {
    if (currentUser?.id) {
      window.dispatchEvent(new CustomEvent("doviztrade:logout", { detail: { userId: currentUser.id } }));
    }
    sessionStorage.removeItem("currentUser");
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    toast.success("Çıkış yapıldı.");
    navigate("/");
  };

  const handleProfileSubmit = async () => {
    if (!currentUser?.id) {
      toast.error("Oturum bulunamadi.");
      return;
    }

    setIsSubmittingProfile(true);
    try {
      const response = await apiRequest(`/api/users/${currentUser.id}/profile-update-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Profil degisiklik talebi gonderilemedi.");
        return;
      }

      toast.success(payload.message || "Profil degisikligi yonetici onayina gonderildi.");
      setIsProfileDialogOpen(false);
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!currentUser?.id) {
      toast.error("Oturum bulunamadi.");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error("Yeni sifre en az 6 karakter olmali.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Yeni sifre ve tekrar sifresi ayni olmali.");
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const response = await apiRequest(`/api/users/${currentUser.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error || "Sifre degistirilemedi.");
        return;
      }

      toast.success(payload.message || "Sifre degistirildi.");
      setIsPasswordDialogOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      toast.error("Sunucuya baglanilamadi.");
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <>
      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-sm">DT</span>
            </div>
            <span className="font-display font-bold text-xl text-foreground">DovizTrade</span>
          </a>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Tema değiştir" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowTransactions(true)}>
              <History className="w-4 h-4 mr-2" />
              İşlemlerim
            </Button>
            {currentUser?.role === "admin" && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/admin-approvals")}>
                Yonetici Paneli
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/messages")}>
              <MessageCircle className="w-4 h-4 mr-2" />
              Mesajlar
            </Button>
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Hesap secenekleri" className="text-muted-foreground">
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setIsProfileDialogOpen(true)}>
                    <User className="w-4 h-4 mr-2" /> Profil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsPasswordDialogOpen(true)}>
                    <KeyRound className="w-4 h-4 mr-2" /> Sifre Degistir
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Cikis
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/login")}>
                <User className="w-4 h-4 mr-2" />
                Giriş Yap
              </Button>
            )}
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleCreateListingClick}>
              <Plus className="w-4 h-4 mr-2" />
              İlan Ver
            </Button>
          </div>

          <Button variant="ghost" size="icon" aria-label="Tema değiştir" className="md:hidden" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-border bg-card px-4 py-3 flex flex-col gap-2">
            <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { setShowTransactions(true); setMenuOpen(false); }}>
              <History className="w-4 h-4 mr-2" /> İşlemlerim
            </Button>
            {currentUser?.role === "admin" && (
              <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { navigate("/admin-approvals"); setMenuOpen(false); }}>
                Yonetici Paneli
              </Button>
            )}
            <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { navigate("/messages"); setMenuOpen(false); }}>
              <MessageCircle className="w-4 h-4 mr-2" /> Mesajlar
            </Button>
            {currentUser ? (
              <>
                <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { setIsProfileDialogOpen(true); setMenuOpen(false); }}>
                  <User className="w-4 h-4 mr-2" /> Profil
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { setIsPasswordDialogOpen(true); setMenuOpen(false); }}>
                  <KeyRound className="w-4 h-4 mr-2" /> Sifre Degistir
                </Button>
                <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { handleLogout(); setMenuOpen(false); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Cikis
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { navigate("/login"); setMenuOpen(false); }}>
                <User className="w-4 h-4 mr-2" /> Giriş Yap
              </Button>
            )}
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { handleCreateListingClick(); setMenuOpen(false); }}>
              <Plus className="w-4 h-4 mr-2" /> İlan Ver
            </Button>
          </div>
        )}
      </nav>

      {showTransactions && <MyTransactionsModal onClose={() => setShowTransactions(false)} transactions={myTransactions} />}

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Profil Bilgileri</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="profile-office">Buro Adi</Label>
              <Input
                id="profile-office"
                value={profileForm.officeName}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, officeName: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="profile-name">Yetkili Ad Soyad</Label>
              <Input
                id="profile-name"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="profile-phone">Telefon</Label>
              <Input
                id="profile-phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="profile-gsm">GSM</Label>
              <Input
                id="profile-gsm"
                value={profileForm.gsm}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, gsm: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="profile-city">Il</Label>
              <Input
                id="profile-city"
                value={profileForm.city}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="profile-district">Ilce</Label>
              <Input
                id="profile-district"
                value={profileForm.district}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, district: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="profile-address">Adres</Label>
              <Input
                id="profile-address"
                value={profileForm.address}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
              Vazgec
            </Button>
            <Button onClick={handleProfileSubmit} disabled={isSubmittingProfile}>
              {isSubmittingProfile ? "Gonderiliyor..." : "Yonetici Onayina Gonder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sifre Degistir</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label htmlFor="current-password">Mevcut Sifre</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new-password">Yeni Sifre</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Yeni Sifre Tekrar</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              Vazgec
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={isSubmittingPassword}>
              {isSubmittingPassword ? "Kaydediliyor..." : "Sifreyi Guncelle"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Navbar;
