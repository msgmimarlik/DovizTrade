import { X, ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MyTransaction {
  id: number;
  type: "buy" | "sell";
  currency: string;
  currencyFlag: string;
  amount: number;
  rate: number;
  counterparty: string;
  counterpartyPhone?: string | null;
  occurredAt?: number;
  time: string;
}

interface MyTransactionsModalProps {
  onClose: () => void;
  transactions: MyTransaction[];
}

const MyTransactionsModal = ({ onClose, transactions }: MyTransactionsModalProps) => {
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

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <History className="w-10 h-10 opacity-30" />
              <p className="text-sm">Henüz işlem geçmişiniz yok.</p>
            </div>
          ) : transactions.map((tx) => (
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
                  {tx.type === "buy" ? "Satıcı" : "Alıcı"}: {tx.counterparty}
                  {tx.counterpartyPhone ? ` · Tel: ${tx.counterpartyPhone}` : ""}
                  {` · Kur: ₺${tx.rate.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
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
