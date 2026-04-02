import { ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";

interface Transaction {
  id: number;
  type: "buy" | "sell";
  currency: string;
  currencyFlag: string;
  amount: number;
  rate: number;
  buyer: string;
  seller: string;
  time: string;
}

const mockTransactions: Transaction[] = [
  { id: 1, type: "buy", currency: "USD", currencyFlag: "🇺🇸", amount: 3000, rate: 38.45, buyer: "Murat K.", seller: "Ahmet K.", time: "12 dk önce" },
  { id: 2, type: "sell", currency: "EUR", currencyFlag: "🇪🇺", amount: 2000, rate: 41.15, buyer: "Elif Y.", seller: "Zeynep A.", time: "28 dk önce" },
  { id: 3, type: "buy", currency: "GAU", currencyFlag: "🥇", amount: 5, rate: 3840, buyer: "Can B.", seller: "Fatma D.", time: "45 dk önce" },
  { id: 4, type: "sell", currency: "GBP", currencyFlag: "🇬🇧", amount: 1000, rate: 48.75, buyer: "Ali R.", seller: "Mehmet S.", time: "1 saat önce" },
  { id: 5, type: "buy", currency: "USD", currencyFlag: "🇺🇸", amount: 8000, rate: 38.50, buyer: "Hasan T.", seller: "Ayşe M.", time: "2 saat önce" },
  { id: 6, type: "sell", currency: "EUR", currencyFlag: "🇪🇺", amount: 4500, rate: 41.20, buyer: "Burak Ö.", seller: "Elif Y.", time: "3 saat önce" },
];

const TransactionHistory = () => {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground">Son İşlemler</h2>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Canlı</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-3 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>İşlem</span>
          <span>Miktar</span>
          <span>Kur</span>
          <span>Taraflar</span>
          <span>Zaman</span>
        </div>

        <div className="divide-y divide-border">
          {mockTransactions.map((tx) => (
            <div
              key={tx.id}
              className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2 sm:gap-4 px-4 py-3 hover:bg-muted/30 transition-colors items-center"
            >
              {/* Currency & Type */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "buy" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {tx.type === "buy" ? (
                    <ArrowDownLeft className="w-4 h-4 text-green-600" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div>
                  <span className="text-lg mr-1.5">{tx.currencyFlag}</span>
                  <span className="font-semibold text-sm text-foreground">{tx.currency}</span>
                  <span className={`ml-2 text-xs font-medium ${tx.type === "buy" ? "text-green-600" : "text-red-500"}`}>
                    {tx.type === "buy" ? "Alım" : "Satım"}
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-sm text-foreground font-medium">
                <span className="sm:hidden text-muted-foreground text-xs mr-1">Miktar:</span>
                {tx.amount.toLocaleString("tr-TR")} {tx.currency}
              </div>

              {/* Rate */}
              <div className="text-sm text-foreground">
                <span className="sm:hidden text-muted-foreground text-xs mr-1">Kur:</span>
                {tx.rate.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
              </div>

              {/* Parties */}
              <div className="text-xs text-muted-foreground">
                <span className="sm:hidden text-muted-foreground mr-1">Taraflar:</span>
                {tx.buyer} → {tx.seller}
              </div>

              {/* Time */}
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {tx.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TransactionHistory;
