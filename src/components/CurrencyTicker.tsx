import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CurrencyRate {
  name: string;
  symbol: string;
  buy: number;
  sell: number;
  change: number;
}

const CurrencyTicker = () => {
  const [rates, setRates] = useState<CurrencyRate[]>([
    { name: "Dolar", symbol: "USD", buy: 38.42, sell: 38.55, change: 0.35 },
    { name: "Euro", symbol: "EUR", buy: 41.18, sell: 41.34, change: -0.12 },
    { name: "Sterlin", symbol: "GBP", buy: 48.76, sell: 48.95, change: 0.22 },
    { name: "Gram Altın", symbol: "GAU", buy: 3842, sell: 3860, change: 1.15 },
    { name: "22 Ayar Altın (Gram)", symbol: "G22", buy: 3520, sell: 3550, change: 0.60 },
    { name: "Çeyrek Altın", symbol: "QAU", buy: 6350, sell: 6450, change: 0.85 },
    { name: "Yarım Altın", symbol: "HAU", buy: 12700, sell: 12900, change: 0.90 },
    { name: "Tam Altın", symbol: "TAU", buy: 25400, sell: 25800, change: 0.95 },
    { name: "Gümüş (Gram)", symbol: "XAG", buy: 32.10, sell: 32.60, change: -0.20 },
  ]);

  return (
    <>
      <table className="w-full text-sm mb-6">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-2 text-left">Ad</th>
            <th className="py-2 text-right">Alış</th>
            <th className="py-2 text-right">Satış</th>
            <th className="py-2 text-right">Değişim</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate, i) => (
            <>
              <tr key={i} className={
                `border-b last:border-b-0`
              }>
                <td className="py-2 font-semibold">{rate.name}</td>
                <td className="py-2 text-right">{rate.buy.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                <td className="py-2 text-right">{rate.sell.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                <td className={`py-2 text-right font-medium ${rate.change >= 0 ? "text-green-600" : "text-red-600"}`}> 
                  <span className="inline-flex items-center gap-1">
                    {rate.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    %{Math.abs(rate.change).toFixed(2)}
                  </span>
                </td>
              </tr>
              {(i === 2 || i === 7) && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <div className="border-b-4 border-primary"></div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {/* Önemli Haberler Tablosu */}
      <table className="w-full text-sm bg-muted rounded-lg">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-2 px-3 text-left">Önemli Haberler</th>
            <th className="py-2 px-3 text-right">Tarih</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 font-medium">TCMB faiz kararı açıklandı: Politika faizi %50'de sabit tutuldu.</td>
            <td className="py-2 px-3 text-right">25.03.2026</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-medium">ABD'de enflasyon beklentilerin üzerinde geldi.</td>
            <td className="py-2 px-3 text-right">24.03.2026</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 font-medium">Altın fiyatları rekor seviyeye yükseldi.</td>
            <td className="py-2 px-3 text-right">23.03.2026</td>
          </tr>
          <tr>
            <td className="py-2 px-3 font-medium">FED Başkanı'nın açıklamaları piyasada dalgalanma yarattı.</td>
            <td className="py-2 px-3 text-right">22.03.2026</td>
          </tr>
        </tbody>
      </table>
    </>
  );
};

export default CurrencyTicker;
