import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

export type NewsItem = {
  title: string;
  link?: string;
  date?: string;
};

type NewsResponse = {
  news?: NewsItem[];
  dayKey?: string;
};

type NewsStreamPayload = {
  type?: "ready" | "news:new" | "news:snapshot" | "news:reset";
  item?: NewsItem;
  news?: NewsItem[];
  dayKey?: string;
};

const NEWS_CACHE_KEY = "market-news:last-success";
const NEWS_REFRESH_MS = 20_000;
const NEWS_RENDER_LIMIT = 12;

const getTrDayKey = (dateValue = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(dateValue);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
};

const readCachedNews = (): { news: NewsItem[]; dayKey: string | null } => {
  if (typeof window === "undefined") return { news: [], dayKey: null };

  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return { news: [], dayKey: null };
    const parsed = JSON.parse(raw) as { news?: NewsItem[]; dayKey?: string };
    const dayKey = typeof parsed.dayKey === "string" ? parsed.dayKey : null;
    const todayKey = getTrDayKey();

    if (!todayKey || dayKey !== todayKey) {
      return { news: [], dayKey: todayKey };
    }

    return {
      news: Array.isArray(parsed.news) ? parsed.news : [],
      dayKey,
    };
  } catch {
    return { news: [], dayKey: null };
  }
};

const writeCachedNews = (news: NewsItem[], dayKey?: string | null) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ news, dayKey: dayKey || getTrDayKey() }));
  } catch {
    // Ignore storage errors.
  }
};

const clearCachedNews = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NEWS_CACHE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const newsIdentity = (item: NewsItem) => [item.link || "", item.title || "", item.date || ""].join("|");

const sortNewsByDateDesc = (items: NewsItem[]) => [...items].sort((a, b) => {
  const aTime = a.date ? new Date(a.date).getTime() : 0;
  const bTime = b.date ? new Date(b.date).getTime() : 0;
  return bTime - aTime;
});

const mergeNews = (base: NewsItem[], incoming: NewsItem[]) => {
  const merged = [...incoming, ...base].filter((item) => item && typeof item.title === "string");
  const deduped = new Map<string, NewsItem>();

  merged.forEach((item) => {
    const key = newsIdentity(item);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  });

  return sortNewsByDateDesc(Array.from(deduped.values())).slice(0, NEWS_RENDER_LIMIT);
};

const useNewsData = () => {
  const cached = readCachedNews();
  const [news, setNews] = useState<NewsItem[]>(cached.news);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let retryTimer: number | null = null;
    let refreshTimer: number | null = null;
    let stream: EventSource | null = null;

    const scheduleRetry = (delayMs: number) => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }

      retryTimer = window.setTimeout(() => {
        load(false);
      }, delayMs);
    };

    const load = async (showLoading: boolean) => {
      setLoading(showLoading);
      setError(null);

      try {
        const response = await fetch(apiUrl("/api/market/news"), {
          headers: { Accept: "application/json" },
        });

        // News feed is optional; keep UI usable if the endpoint is not configured.
        if (response.status === 404 || response.status === 501) {
          if (!isCancelled) {
            setLoading(false);
          }
          return;
        }

        if (!response.ok) {
          throw new Error(`Haber servisi gecici olarak ulasilamiyor (${response.status}).`);
        }

        const body = (await response.json()) as NewsResponse;
        const rows = Array.isArray(body.news) ? body.news : [];
        const normalized = rows
          .filter((item) => item && typeof item.title === "string")
          .map((item) => ({
            title: item.title,
            link: item.link,
            date: item.date,
          }))
          .slice(0, NEWS_RENDER_LIMIT);

        if (!isCancelled) {
          setNews(normalized);
          writeCachedNews(normalized, body.dayKey || getTrDayKey());

          if (normalized.length === 0) scheduleRetry(10_000);
        }
      } catch {
        if (!isCancelled) {
          // News is non-critical for the page; fail silently to avoid noisy UI.
          setError(null);
          scheduleRetry(10_000);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    const connectStream = () => {
      if (!("EventSource" in window)) {
        return;
      }

      if (stream) {
        stream.close();
      }

      stream = new EventSource(apiUrl("/api/market/news/stream"));

      const handleStreamNews = (payload: NewsStreamPayload) => {
        if (!payload || isCancelled) return;

        if (payload.type === "news:new" && payload.item?.title) {
          setNews((current) => {
            const updated = mergeNews(current, [payload.item as NewsItem]);
            writeCachedNews(updated, payload.dayKey || getTrDayKey());
            return updated;
          });
          return;
        }

        if (payload.type === "news:reset") {
          setNews([]);
          clearCachedNews();
          return;
        }

        if (payload.type === "news:snapshot" && Array.isArray(payload.news)) {
          const normalized = payload.news
            .filter((item) => item && typeof item.title === "string")
            .map((item) => ({
              title: item.title,
              link: item.link,
              date: item.date,
            }))
            .slice(0, NEWS_RENDER_LIMIT);

          setNews(normalized);
          writeCachedNews(normalized, payload.dayKey || getTrDayKey());
        }
      };

      stream.addEventListener("news:new", (event) => {
        try {
          handleStreamNews(JSON.parse(event.data) as NewsStreamPayload);
        } catch {
          // Ignore malformed stream payload.
        }
      });

      stream.addEventListener("news:snapshot", (event) => {
        try {
          handleStreamNews(JSON.parse(event.data) as NewsStreamPayload);
        } catch {
          // Ignore malformed stream payload.
        }
      });

      stream.addEventListener("news:reset", (event) => {
        try {
          handleStreamNews(JSON.parse(event.data) as NewsStreamPayload);
        } catch {
          // Ignore malformed stream payload.
        }
      });

      stream.onerror = () => {
        // EventSource performs automatic reconnects; avoid manual reconnect loops.
        if (!isCancelled) setError(null);
      };
    };

    load(news.length === 0);
    connectStream();

    refreshTimer = window.setInterval(() => {
      load(false);
    }, NEWS_REFRESH_MS);

    return () => {
      isCancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
      }
      if (stream) {
        stream.close();
        stream = null;
      }
    };
  }, []);

  return { news, loading, error };
};

export default useNewsData;
