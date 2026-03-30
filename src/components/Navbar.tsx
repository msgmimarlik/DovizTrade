
import { Plus, MessageCircle, User, Menu, History, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import MyTransactionsModal, { type MyTransaction } from "@/components/MyTransactionsModal";
import { toast } from "sonner";

type CurrentUser = {
  id: number;
  name: string;
  email: string;
  location: string;
};

const Navbar = () => {

  const [menuOpen, setMenuOpen] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [myTransactions, setMyTransactions] = useState<MyTransaction[]>([]);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const rawUser = localStorage.getItem("currentUser");
    if (!rawUser) {
      setCurrentUser(null);
      return;
    }

    try {
      const user = JSON.parse(rawUser);
      setCurrentUser(user);
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
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    toast.success("Çıkış yapıldı.");
    navigate("/");
  };

  return (
    <>
      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-lg">D</span>
            </div>
            <span className="font-display font-bold text-xl text-foreground">Dövizcim</span>
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
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleLogout}>
                <User className="w-4 h-4 mr-2" />
                {currentUser.name} (Çıkış)
              </Button>
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
              <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => { handleLogout(); setMenuOpen(false); }}>
                <User className="w-4 h-4 mr-2" /> {currentUser.name} (Çıkış)
              </Button>
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
    </>
  );
};

export default Navbar;
