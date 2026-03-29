import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

const Login = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [officeName, setOfficeName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gsm, setGsm] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [captchaCode, setCaptchaCode] = useState("7894");
  const [captchaInput, setCaptchaInput] = useState("");

  const cityOptions = [
    "Istanbul",
    "Ankara",
    "Izmir",
    "Bursa",
    "Antalya",
    "Kocaeli",
    "Konya",
    "Adana",
    "Gaziantep",
    "Mersin",
  ];

  const generateCaptcha = () => {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setCaptchaCode(code);
  };

  useEffect(() => {
    generateCaptcha();
  }, [isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLogin) {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const payload = await response.json();

        if (!response.ok) {
          toast.error(payload.error || "Giriş başarısız.");
          return;
        }

        localStorage.setItem("currentUser", JSON.stringify(payload.user));
        toast.success("Giriş başarılı.");
        navigate("/");
      } catch {
        toast.error("Sunucuya bağlanılamadı.");
      }
      return;
    }

    if (!officeName || !name || !username || !email || !phone || !gsm || !city || !district || !address || !password || !passwordRepeat || !captchaInput) {
      toast.error("Lütfen tüm alanları doldurun.");
      return;
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      toast.error("Kullanıcı adı küçük harf ve Türkçe karakter içermeden girilmelidir.");
      return;
    }

    if (!/^[a-z0-9!@#$%^&*._-]{6,}$/.test(password)) {
      toast.error("Şifre en az 6 karakter olmalı; büyük harf veya Türkçe karakter içermemelidir.");
      return;
    }

    if (password !== passwordRepeat) {
      toast.error("Şifre tekrar alanı uyuşmuyor.");
      return;
    }

    if (captchaInput !== captchaCode) {
      toast.error("Güvenlik kodu hatalı.");
      generateCaptcha();
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeName,
          name,
          username,
          email,
          phone,
          gsm,
          city,
          district,
          address,
          password,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        toast.error(payload.error || "Kayit basarisiz.");
        return;
      }

      toast.success(payload.message || "Kayit basvurunuz yonetici onayina gonderildi.");
      setIsLogin(true);
      setPassword("");
      setPasswordRepeat("");
      setCaptchaInput("");
    } catch {
      toast.error("Sunucuya bağlanılamadı.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <Button variant="ghost" className="mb-6 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ana Sayfa
        </Button>

        <div className="bg-card border border-border rounded-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-lg">D</span>
            </div>
            <span className="font-display font-bold text-xl text-foreground">Dövizcim</span>
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            {isLogin ? "Giriş Yap" : "Kayıt Ol"}
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            {isLogin ? "Hesabınıza giriş yapın" : "Yeni bir hesap oluşturun"}
          </p>

          {/* Demo bilgi mesajı kaldırıldı */}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="officeName">Büro Adı</Label>
                  <Input id="officeName" value={officeName} onChange={(e) => setOfficeName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Yetkili Ad Soyadı</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
                  <p className="text-xs font-semibold text-foreground">
                    KUCUK HARF GIRINIZ TURKCE KARAKTER KULLANMAYINIZ. Sisteme bu adla giris yapacaksiniz.
                  </p>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" type="email" placeholder="ornek@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gsm">GSM</Label>
                  <Input id="gsm" value={gsm} onChange={(e) => setGsm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Il</Label>
                  <Select value={city} onValueChange={setCity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seciniz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cityOptions.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="district">Ilce</Label>
                  <Input id="district" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adres</Label>
                  <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {!isLogin && (
              <>
                <p className="text-xs font-semibold text-foreground">
                  BUYUK HARF VEYA TURKCE KARAKTER GIREMEZSINIZ. SIFRENIZ 6 KARAKTERDEN KUCUK OLAMAZ
                </p>
                <div className="space-y-2">
                  <Label htmlFor="passwordRepeat">Sifre Tekrar</Label>
                  <Input id="passwordRepeat" type="password" value={passwordRepeat} onChange={(e) => setPasswordRepeat(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Guvenlik Kodu</Label>
                  <div className="rounded-md border border-border px-3 py-2 bg-muted/40 font-bold text-xl tracking-[0.2em] select-none">
                    {captchaCode}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="captchaInput">Guvenlik Kodunu Girin</Label>
                  <Input id="captchaInput" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} />
                </div>
              </>
            )}
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {isLogin ? "Giriş Yap" : "Gonder"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            {isLogin ? "Hesabınız yok mu?" : "Zaten hesabınız var mı?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setOfficeName("");
                setName("");
                setUsername("");
                setEmail("");
                setPhone("");
                setGsm("");
                setCity("");
                setDistrict("");
                setAddress("");
                setPassword("");
                setPasswordRepeat("");
                setCaptchaInput("");
              }}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? "Kayıt Ol" : "Giriş Yap"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
