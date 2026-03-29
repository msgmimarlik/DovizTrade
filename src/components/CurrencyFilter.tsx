import { useState } from "react";
import { DollarSign, Euro, PoundSterling, Coins, CircleDot, Link2 } from "lucide-react";

const currencies = [
  { name: "Tümü", icon: CircleDot, id: "all" },
  { name: "USD", icon: DollarSign, id: "USD" },
  { name: "EUR", icon: Euro, id: "EUR" },
  { name: "GBP", icon: PoundSterling, id: "GBP" },
  { name: "Tether", icon: Link2, id: "USDT" },
  { name: "Altın", icon: Coins, id: "GAU" },
];

interface CurrencyFilterProps {
  onCurrencyChange?: (currency: string) => void;
  activeType: "all" | "buy" | "sell";
  onTypeChange: (type: "all" | "buy" | "sell") => void;
}

const CurrencyFilter = ({ onCurrencyChange, activeType, onTypeChange }: CurrencyFilterProps) => {
  const [activeCurrency, setActiveCurrency] = useState("all");

  const handleClick = (id: string) => {
    setActiveCurrency(id);
    onCurrencyChange?.(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["all", "buy", "sell"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTypeChange(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeType === t
                ? t === "buy"
                  ? "bg-emerald-500 text-white shadow-md"
                  : t === "sell"
                  ? "bg-red-500 text-white shadow-md"
                  : "bg-primary text-primary-foreground shadow-md"
                : "bg-card text-muted-foreground hover:bg-muted border border-border"
            }`}
          >
            {t === "all" ? "Tümü" : t === "buy" ? "Alım İlanları" : "Satım İlanları"}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {currencies.map((cur) => {
          const Icon = cur.icon;
          const isActive = activeCurrency === cur.id;
          return (
            <button
              key={cur.id}
              onClick={() => handleClick(cur.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-card text-muted-foreground hover:bg-muted border border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {cur.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CurrencyFilter;
