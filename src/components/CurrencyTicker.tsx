import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import useTickerData from "@/hooks/useTickerData";
import useNewsData from "@/hooks/useNewsData";

const CurrencyTicker = () => {
  const { rates, updatedAt, error, isLoading } = useTickerData();
  const [flashByKey, setFlashByKey] = useState<Record<string, "up" | "down">>({});
  const [highlightedNewsByKey, setHighlightedNewsByKey] = useState<Record<string, boolean>>({});
  const prevRatesRef = useRef<Record<string, { buy: number; sell: number }> | null>(null);
  const flashTimersRef = useRef<Record<string, number>>({});
  const seenNewsRef = useRef<Set<string>>(new Set());
  const newsHighlightTimersRef = useRef<Record<string, number>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollHideTimerRef = useRef<number | null>(null);
  const newsScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const newsScrollHideTimerRef = useRef<number | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [newsHasOverflow, setNewsHasOverflow] = useState(false);
  const [isNewsUserScrolling, setIsNewsUserScrolling] = useState(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const { news, loading: newsLoading, error: newsError } = useNewsData();

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
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);

      Object.values(flashTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });

      Object.values(newsHighlightTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });

      if (scrollHideTimerRef.current) {
        window.clearTimeout(scrollHideTimerRef.current);
      }

      if (newsScrollHideTimerRef.current) {
        window.clearTimeout(newsScrollHideTimerRef.current);
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

  useEffect(() => {
    const container = newsScrollContainerRef.current;
    if (!container) return;

    const updateOverflowState = () => {
      const overflow = container.scrollHeight > container.clientHeight + 1;
      setNewsHasOverflow(overflow);
      if (!overflow) {
        setIsNewsUserScrolling(false);
      }
    };

    updateOverflowState();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateOverflowState);
    observer.observe(container);
    return () => observer.disconnect();
  }, [news]);

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

  const handleNewsScroll = () => {
    if (!newsHasOverflow) return;

    setIsNewsUserScrolling(true);
    if (newsScrollHideTimerRef.current) {
      window.clearTimeout(newsScrollHideTimerRef.current);
    }

    newsScrollHideTimerRef.current = window.setTimeout(() => {
      setIsNewsUserScrolling(false);
      newsScrollHideTimerRef.current = null;
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

  const getNewsKey = (item: { title: string; link?: string; date?: string }, index?: number) =>
    `${item.link || "nolink"}|${item.title}|${item.date || "nodate"}|${index ?? ""}`;

  useEffect(() => {
    if (!news || news.length === 0) return;

    const currentKeys = news.map((item, index) => getNewsKey(item, index));

    // On first load, do not flash all existing rows as new.
    if (seenNewsRef.current.size === 0) {
      seenNewsRef.current = new Set(currentKeys);
      return;
    }

    const newKeys = currentKeys.filter((key) => !seenNewsRef.current.has(key));
    if (newKeys.length === 0) {
      seenNewsRef.current = new Set(currentKeys);
      return;
    }

    setHighlightedNewsByKey((current) => {
      const next = { ...current };
      newKeys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });

    newKeys.forEach((key) => {
      const existingTimer = newsHighlightTimersRef.current[key];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      newsHighlightTimersRef.current[key] = window.setTimeout(() => {
        setHighlightedNewsByKey((current) => {
          if (!current[key]) return current;
          const updated = { ...current };
          delete updated[key];
          return updated;
        });
        delete newsHighlightTimersRef.current[key];
      }, 3500);
    });

    seenNewsRef.current = new Set(currentKeys);
  }, [news]);

  const formatNewsTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    const diffMs = nowTick - date.getTime();
    if (diffMs < 0) {
      // Handle small clock drifts between client and source timestamps.
      if (Math.abs(diffMs) <= 5 * 60 * 1000) return "az once";
      const minsAhead = Math.ceil(Math.abs(diffMs) / 60000);
      return `${minsAhead} dk sonra`;
    }

    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "az once";
    if (diffMin < 60) return `${diffMin} dk once`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} sa once`;

    return date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  };

  const formatNewsAbsoluteTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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
            <Fragment key={`${rate.symbol}-${i}`}>
              <tr className={
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
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>


      <section className="w-full mt-4 rounded-lg border border-border bg-muted/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Guncel Haber Akisi</h4>
          <span className="text-[11px] text-muted-foreground">
            {newsLoading ? "yenileniyor" : "canli akıs"}
          </span>
        </div>

        <div
          ref={newsScrollContainerRef}
          onScroll={handleNewsScroll}
          className={`max-h-44 space-y-2 ${newsHasOverflow ? "overflow-y-auto" : "overflow-y-hidden"} ${newsHasOverflow && isNewsUserScrolling ? "pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/70" : "[&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent"}`}
        >
          {newsError && (
            <p className="text-xs text-red-500">{newsError}</p>
          )}

          {!newsLoading && news.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Haber bulunamadı.</p>
          )}

          {news.map((item, i) => {
            const rowKey = getNewsKey(item, i);
            const isNewlyArrived = Boolean(highlightedNewsByKey[rowKey]);

            return (
            <article
              key={rowKey}
              className={`rounded-md border border-border/70 bg-background/70 p-2 transition-colors ${isNewlyArrived ? "bg-primary/15 ring-1 ring-primary/60 animate-pulse" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium leading-snug text-foreground hover:text-primary hover:underline line-clamp-2"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">{item.title}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                  <span title={`TR saati: ${formatNewsAbsoluteTime(item.date)}`}>
                    {formatNewsTime(item.date)}
                  </span>
                </span>
              </div>
            </article>
            );
          })}
        </div>
      </section>

      {/* İkinci piyasa verisi tablosu kaldırıldı */}
    </>
  );
};

export default CurrencyTicker;
