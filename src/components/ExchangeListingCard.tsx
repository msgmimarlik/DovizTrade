import { ArrowUpDown, MapPin, Clock, User, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ExchangeListingCardProps {
  type: "buy" | "sell";
  currency: string;
  currencyFlag: string;
  amount: number;
  rate: number;
  totalTL: number;
  location: string;
  time: string;
  userName: string;
  minAmount?: number;
}

const ExchangeListingCard = ({
  type, currency, currencyFlag, amount, rate, totalTL, location, time, userName, minAmount,
}: ExchangeListingCardProps) => {
  const isBuy = type === "buy";

  return (
    <div className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className={`px-4 py-2.5 flex items-center justify-between ${isBuy ? "bg-emerald-500/10 border-b border-emerald-500/20" : "bg-red-500/10 border-b border-red-500/20"}`}>
        <span className={`flex items-center gap-2 text-sm font-semibold ${isBuy ? "text-emerald-600" : "text-red-500"}`}>
          {isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isBuy ? "ALIM İLANI" : "SATIM İLANI"}
        </span>
        <span className="text-2xl">{currencyFlag}</span>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Döviz</p>
            <p className="font-display text-xl font-bold text-foreground">{currency}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Miktar</p>
            <p className="font-display text-xl font-bold text-foreground">
              {amount.toLocaleString("tr-TR")}
            </p>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Kur</p>
            <p className="font-display font-bold text-lg text-primary">
              {rate.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
            </p>
          </div>
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Toplam</p>
            <p className="font-display font-bold text-lg text-foreground">
              {totalTL.toLocaleString("tr-TR")} ₺
            </p>
          </div>
        </div>

        {minAmount && (
          <p className="text-xs text-muted-foreground mb-3">
            Min. işlem: {minAmount.toLocaleString("tr-TR")} {currency}
          </p>
        )}

        <Button
          className={`w-full ${!isBuy ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
          onClick={() => toast.success(`${isBuy ? "Alım" : "Satım"} teklifi gönderildi!`, { description: `${amount.toLocaleString("tr-TR")} ${currency} için ${userName} kullanıcısına teklif iletildi.` })}
        >
          İşlem Yap
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {userName}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {time}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExchangeListingCard;
