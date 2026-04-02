import { useEffect, useMemo, useRef, useState } from "react";
import useTickerData from "@/hooks/useTickerData";

const CurrencyTicker = () => {
  const { rates, updatedAt, error, isLoading } = useTickerData();
  const [flashByKey, setFlashByKey] = useState<Record<string, "up" | "down">>({});
  const prevRatesRef = useRef<Record<string, { buy: number; sell: number }> | null>(null);
  const flashTimersRef = useRef<Record<string, number>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollHideTimerRef = useRef<number | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  const displayRates = useMemo(() => {
    const bySymbol = new Map(rates.map((rate) => [rate.symbol, rate]));

    const makeFromGauge = (name: string, symbol: string, factor: number) => {
      const gau = bySymbol.get("GAU");
      if (!gau) return null;

      const buy = Number((gau.buy * factor).toFixed(2));
      const sell = Number((gau.sell * factor).toFixed(2));
      if (!Number.isFinite(buy) || !Number.isFinite(sell)) return null;

      return {
        ...gau,
        name,
        symbol,
        buy,
        sell,
      };
    };

    const fxRows = ["USD", "EUR", "EURUSD", "GBP"]
      .map((symbol) => bySymbol.get(symbol))
      .filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));

    const coreGoldRows = ["GAU", "QAU", "HAU", "TAU"]
      .map((symbol) => bySymbol.get(symbol))
      .filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));

    const goldRows = [
      makeFromGauge("22 Ayar", "G22P", 22 / 24),
      makeFromGauge("14 Ayar", "G14P", 14 / 24),
      makeFromGauge("Yeni Çeyrek", "QAU_NEW", 1.754),
      makeFromGauge("Eski Çeyrek", "QAU_OLD", 1.745),
      makeFromGauge("Yeni Yarım", "HAU_NEW", 3.508),
      makeFromGauge("Eski Yarım", "HAU_OLD", 3.490),
      makeFromGauge("Yeni Tam", "TAU_NEW", 7.016),
      makeFromGauge("Eski Tam", "TAU_OLD", 6.980),
      makeFromGauge("Yeni Ata", "ATA_NEW", 7.216),
      makeFromGauge("Eski Ata", "ATA_OLD", 7.180),
      makeFromGauge("Yeni Ata5", "ATA5_NEW", 36.08),
      makeFromGauge("Eski Ata5", "ATA5_OLD", 35.90),
      makeFromGauge("Yeni Gremse", "GREMSE_NEW", 17.54),
      makeFromGauge("Eski Gremse", "GREMSE_OLD", 17.45),
    ].filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));

    const silver = bySymbol.get("XAG");

    return [
      ...fxRows,
      ...coreGoldRows,
      ...goldRows,
      ...(silver ? [silver] : []),
    ];
  }, [rates]);

  useEffect(() => {
    const prevRates = prevRatesRef.current;
    if (prevRates) {
      const nextFlashes: Record<string, "up" | "down"> = {};

      displayRates.forEach((rate) => {
        const prev = prevRates[rate.symbol];
        if (!prev) return;

        if (rate.buy !== prev.buy) {
          nextFlashes[`${rate.symbol}-buy`] = rate.buy > prev.buy ? "up" : "down";
        }

        if (rate.sell !== prev.sell) {
          nextFlashes[`${rate.symbol}-sell`] = rate.sell > prev.sell ? "up" : "down";
        }
      });

      if (Object.keys(nextFlashes).length > 0) {
        setFlashByKey((current) => ({ ...current, ...nextFlashes }));

        Object.keys(nextFlashes).forEach((key) => {
          const existingTimer = flashTimersRef.current[key];
          if (existingTimer) {
            window.clearTimeout(existingTimer);
          }

          flashTimersRef.current[key] = window.setTimeout(() => {
            setFlashByKey((current) => {
              if (!current[key]) return current;
              const updated = { ...current };
              delete updated[key];
              return updated;
            });
            delete flashTimersRef.current[key];
          }, 2000);
        });
      }
    }

    prevRatesRef.current = Object.fromEntries(
      displayRates.map((rate) => [rate.symbol, { buy: rate.buy, sell: rate.sell }]),
    );
  }, [displayRates]);

  useEffect(() => {
    return () => {
      Object.values(flashTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });

      if (scrollHideTimerRef.current) {
        window.clearTimeout(scrollHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateOverflowState = () => {
      const overflow = container.scrollHeight > container.clientHeight + 1;
      setHasOverflow(overflow);
      if (!overflow) {
        setIsUserScrolling(false);
      }
    };

    updateOverflowState();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateOverflowState);
    observer.observe(container);
    return () => observer.disconnect();
  }, [displayRates]);

  const handleScroll = () => {
    if (!hasOverflow) return;

    setIsUserScrolling(true);
    if (scrollHideTimerRef.current) {
      window.clearTimeout(scrollHideTimerRef.current);
    }

    scrollHideTimerRef.current = window.setTimeout(() => {
      setIsUserScrolling(false);
      scrollHideTimerRef.current = null;
    }, 600);
  };

  const getFlashColorClass = (key: string) => {
    if (flashByKey[key] === "up") return "text-green-500";
    if (flashByKey[key] === "down") return "text-red-500";
    return "text-foreground";
  };

  const formatRate = (symbol: string, value: number) => {
    const fxSymbols = ["USD", "EUR", "GBP", "USDT"];
    const metalSymbols = ["GAU", "G22", "QAU", "HAU", "TAU", "XAG"];
    const fractionDigits = symbol === "EURUSD"
      ? 4
      : fxSymbols.includes(symbol)
        ? 3
        : metalSymbols.includes(symbol)
          ? 2
          : 1;
    return value.toLocaleString("tr-TR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const formattedUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const hasRates = displayRates.length > 0;
  const getDisplayName = (symbol: string, name: string) => {
    if (symbol === "EURUSD") return "Eur/Usd";
    return name;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted-foreground">
          Son guncelleme: {formattedUpdatedAt || "-"}
        </p>
        <span className={`text-[11px] ${error ? "text-red-500" : "text-green-600"}`}>
          {isLoading && !hasRates ? "Yukleniyor" : error ? "Veri uyarisi" : "Canlı"}
        </span>
      </div>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`max-h-[430px] mb-6 ${hasOverflow ? "overflow-y-auto" : "overflow-y-hidden"} ${hasOverflow && isUserScrolling ? "pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/70" : "[&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent"}`}
      >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-2 text-left">Ad</th>
            <th className="py-2 text-right">Alış</th>
            <th className="py-2 text-right">Satış</th>
          </tr>
        </thead>
        <tbody>
          {!hasRates && isLoading && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-muted-foreground">
                Guncel kurlar yukleniyor...
              </td>
            </tr>
          )}
          {hasRates && displayRates.map((rate, i) => (
            <>
              <tr key={`${rate.symbol}-${i}`} className={
                `border-b last:border-b-0`
              }>
                <td className="py-2 font-semibold">{getDisplayName(rate.symbol, rate.name)}</td>
                <td className={`py-2 text-right transition-colors duration-700 ${getFlashColorClass(`${rate.symbol}-buy`)}`}>
                  {formatRate(rate.symbol, rate.buy)}
                </td>
                <td className={`py-2 text-right transition-colors duration-700 ${getFlashColorClass(`${rate.symbol}-sell`)}`}>
                  {formatRate(rate.symbol, rate.sell)}
                </td>
              </tr>
              {(rate.symbol === "GBP" || rate.symbol === "GREMSE_OLD") && (
                <tr>
                  <td colSpan={3} className="p-0">
                    <div className="border-b-4 border-primary"></div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      </div>

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

      {/* İkinci piyasa verisi tablosu kaldırıldı */}
    </>
  );
};

export default CurrencyTicker;
