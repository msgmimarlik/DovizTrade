import { ArrowLeft, DollarSign, Euro, PoundSterling, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type CurrentUser = {
  id: number;
  name: string;
  email: string;
  location: string;
};

const CreateListing = () => {
  const navigate = useNavigate();
  const [type, setType] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [secondCurrency, setSecondCurrency] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [isDivisible, setIsDivisible] = useState<boolean>(true);
  const [isBankTransfer, setIsBankTransfer] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const rawUser = localStorage.getItem("currentUser");
    if (!rawUser) {
      toast.error("İlan oluşturmak için önce giriş yapın.");
      navigate("/login");
      return;
    }

    try {
      setCurrentUser(JSON.parse(rawUser));
    } catch {
      toast.error("Oturum bilgisi okunamadı. Tekrar giriş yapın.");
      navigate("/login");
    }
  }, [navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!type || !currency || !amount || !rate || !duration) {
      toast.error("Lütfen zorunlu alanları doldurun.");
      return;
    }

    if (type === "arbitrage" && !secondCurrency) {
      toast.error("Arbitraj ilanı için 2. döviz türünü seçin.");
      return;
    }

    const hasSecondCurrency = Boolean(secondCurrency);
    const isTryQuotedListing = !hasSecondCurrency || secondCurrency === "TRY";
    const isArbitrageListing = hasSecondCurrency && secondCurrency !== "TRY";

    if (type === "arbitrage" && isTryQuotedListing) {
      toast.error("2. para birimi TL ise ilan tipi olarak Alım veya Satım seçin.");
      return;
    }

    if (!currentUser) {
      toast.error("İlan oluşturmak için giriş yapın.");
      navigate("/login");
      return;
    }

    const currencyFlags: Record<string, string> = {
      TRY: "🇹🇷",
      USD: "🇺🇸",
      EUR: "🇪🇺",
      GBP: "🇬🇧",
      USDT: "🪙",
      GAU: "🥇",
    };

    const amountValue = Number(amount);
    const rateValue = Number(rate);

    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "ws://localhost:8787";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (isArbitrageListing) {
        const arbitrageListing = {
          kind: "arbitrage",
          id: Date.now(),
          currency: `${currency}/${secondCurrency}`,
          currencyFlag: `${currencyFlags[currency] ?? ""}/${currencyFlags[secondCurrency] ?? ""}`,
          amount: amountValue,
          rate: rateValue,
          total: `${(amountValue * rateValue).toLocaleString("tr-TR")} ${secondCurrency}`,
          userName: currentUser.name,
          location: currentUser.location,
          duration,
          isDivisible,
          isBankTransfer,
        };
        ws.send(JSON.stringify({ type: "listing:create", listing: arbitrageListing }));
      } else {
        const standardListing = {
          kind: "standard",
          id: Date.now(),
          type: type === "sell" ? "sell" : "buy",
          currency,
          currencyFlag: currencyFlags[currency] ?? "",
          amount: amountValue,
          rate: rateValue,
          totalTL: Math.round(amountValue * rateValue),
          location: currentUser.location,
          duration,
          userName: currentUser.name,
          isDivisible,
          isBankTransfer,
        };
        ws.send(JSON.stringify({ type: "listing:create", listing: standardListing }));
      }

      ws.close();
      toast.success("İlan yayınlandı.");
      navigate("/");
    };

    ws.onerror = () => {
      toast.error("İlan sunucusuna bağlanılamadı.");
    };
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button variant="ghost" className="mb-6 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ana Sayfa
        </Button>

        <div className="bg-card border border-border rounded-xl p-8">
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Yeni İlan Ver</h1>
          <p className="text-muted-foreground text-sm mb-8">Döviz veya altın alım/satım ilanı oluşturun.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>İlan Tipi</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seçiniz" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Alım İlanı</SelectItem>
                    <SelectItem value="sell">Satım İlanı</SelectItem>
                    <SelectItem value="arbitrage">Arbitraj İlanı</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Döviz Türü</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seçiniz" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">🇺🇸 Amerikan Doları (USD)</SelectItem>
                    <SelectItem value="EUR">🇪🇺 Euro (EUR)</SelectItem>
                    <SelectItem value="GBP">🇬🇧 İngiliz Sterlini (GBP)</SelectItem>
                    <SelectItem value="USDT">🪙 Tether (USDT)</SelectItem>
                    <SelectItem value="GAU">🥇 Gram Altın</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>2. Döviz Türü (Arbitraj için)</Label>
              <Select value={secondCurrency} onValueChange={setSecondCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Seçiniz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRY">🇹🇷 Türk Lirası (TRY)</SelectItem>
                  <SelectItem value="USD">🇺🇸 Amerikan Doları (USD)</SelectItem>
                  <SelectItem value="EUR">🇪🇺 Euro (EUR)</SelectItem>
                  <SelectItem value="GBP">🇬🇧 İngiliz Sterlini (GBP)</SelectItem>
                  <SelectItem value="USDT">🪙 Tether (USDT)</SelectItem>
                  <SelectItem value="GAU">🥇 Gram Altın</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Miktar</Label>
                <Input id="amount" type="number" placeholder="ör: 5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Kur</Label>
                <Input id="rate" type="number" step="0.01" placeholder="ör: 38.50" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Süre</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue placeholder="Seçiniz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15 dk">15 dk</SelectItem>
                  <SelectItem value="30 dk">30 dk</SelectItem>
                  <SelectItem value="45 dk">45 dk</SelectItem>
                  <SelectItem value="1 saat">1 saat</SelectItem>
                  <SelectItem value="1.5 saat">1.5 saat</SelectItem>
                  <SelectItem value="2 saat">2 saat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Not (opsiyonel)</Label>
              <Textarea id="note" placeholder="Ek bilgi ekleyebilirsiniz..." rows={3} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/40 cursor-pointer select-none">
                <Checkbox checked={isDivisible} onCheckedChange={(v) => setIsDivisible(!!v)} />
                <span className="font-medium">BÖLÜNEBİLİR</span>
              </label>
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/40 cursor-pointer select-none">
                <Checkbox checked={isBankTransfer} onCheckedChange={(v) => setIsBankTransfer(!!v)} />
                <span className="font-medium">BANKADAN OLABİLİR (EFT)</span>
              </label>
            </div>

            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-semibold">
              İlanı Yayınla
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateListing;
