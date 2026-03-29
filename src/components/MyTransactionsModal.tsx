import { X, ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MyTransaction {
  id: number;
  type: "buy" | "sell";
  currency: string;
  currencyFlag: string;
  amount: number;
  rate: number;
  totalTL: number;
  counterparty: string;
  time: string;
}

const myTransactions: MyTransaction[] = [
  { id: 1, type: "buy", currency: "USD", currencyFlag: "🇺🇸", amount: 3000, rate: 38.45, totalTL: 115350, counterparty: "Ahmet K.", time: "Bugün, 14:30" },
  { id: 2, type: "sell", currency: "EUR", currencyFlag: "🇪🇺", amount: 2000, rate: 41.15, totalTL: 82300, counterparty: "Zeynep A.", time: "Bugün, 11:20" },
  { id: 3, type: "buy", currency: "GAU", currencyFlag: "🥇", amount: 5, rate: 3840, totalTL: 19200, counterparty: "Fatma D.", time: "Dün, 16:45" },
  { id: 4, type: "sell", currency: "USD", currencyFlag: "🇺🇸", amount: 5000, rate: 38.50, totalTL: 192500, counterparty: "Can B.", time: "Dün, 09:10" },
  { id: 5, type: "buy", currency: "GBP", currencyFlag: "🇬🇧", amount: 1000, rate: 48.75, totalTL: 48750, counterparty: "Mehmet S.", time: "22 Mar, 15:00" },
];

interface MyTransactionsModalProps {
  onClose: () => void;
}

const MyTransactionsModal = ({ onClose }: MyTransactionsModalProps) => {
  const totalBuy = myTransactions.filter((t) => t.type === "buy").reduce((s, t) => s + t.totalTL, 0);
  const totalSell = myTransactions.filter((t) => t.type === "sell").reduce((s, t) => s + t.totalTL, 0);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">İşlem Geçmişim</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border">
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Toplam Alım</p>
            <p className="font-display font-bold text-foreground">₺{totalBuy.toLocaleString("tr-TR")}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Toplam Satım</p>
            <p className="font-display font-bold text-foreground">₺{totalSell.toLocaleString("tr-TR")}</p>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {myTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "buy" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {tx.type === "buy" ? (
                  <ArrowDownLeft className="w-4 h-4 text-green-600" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{tx.currencyFlag}</span>
                  <span className="font-semibold text-sm text-foreground">
                    {tx.amount.toLocaleString("tr-TR")} {tx.currency}
                  </span>
                  <span className={`text-xs font-medium ${tx.type === "buy" ? "text-green-600" : "text-red-500"}`}>
                    {tx.type === "buy" ? "Alım" : "Satım"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {tx.type === "buy" ? "Satıcı" : "Alıcı"}: {tx.counterparty} · Kur: ₺{tx.rate.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-foreground">₺{tx.totalTL.toLocaleString("tr-TR")}</p>
                <p className="text-[11px] text-muted-foreground">{tx.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyTransactionsModal;
