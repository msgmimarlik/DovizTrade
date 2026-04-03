import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import Parser from 'rss-parser';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatArchivePath = path.join(__dirname, 'chat-archive.json');
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'secmen-17Murat',
  database: 'doviztrader',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const dbp = db.promise();

const query = async (sql, params = []) => {
  const [rows] = await dbp.query(sql, params);
  return rows;
};

const MARKET_TICKER_CACHE_MS = 0;
const ERCIL_TICKER_URL = 'https://ercilsarrafiye.com/panel/kurguncelle.php';
const MARKET_NEWS_CACHE_MS = 5 * 60 * 1000;
const MARKET_NEWS_LIMIT = 8;
const MARKET_NEWS_STREAM_POLL_MS = 15 * 1000;
const MARKET_NEWS_TZ = 'Europe/Istanbul';
const MARKET_NEWS_FEEDS = [
  'https://news.google.com/rss/search?q=doviz+OR+altin+OR+faiz+OR+enflasyon+OR+tcmb+OR+fed+OR+petrol+OR+borsa&hl=tr&gl=TR&ceid=TR:tr',
  'https://www.aa.com.tr/tr/rss/default?cat=ekonomi',
  'https://www.trthaber.com/sondakika_articles.rss',
];

const MARKET_NEWS_STRONG_KEYWORDS = [
  'tcmb',
  'merkez bankasi',
  'faiz',
  'enflasyon',
  'doviz',
  'kur',
  'usd',
  'dolar',
  'euro',
  'sterlin',
  'altin',
  'ons',
  'gram altin',
  'petrol',
  'brent',
  'borsa',
  'bist',
  'fed',
  'ecb',
  'swap',
  'cari acik',
  'rezerv',
];

const MARKET_NEWS_SUPPORTING_KEYWORDS = [
  'buyume',
  'issizlik',
  'ihracat',
  'ithalat',
  'sanayi uretimi',
  'pmi',
  'tufe',
  'ufe',
  'gsyh',
  'hazine',
  'tahvil',
  'veri aciklandi',
  'son dakika ekonomi',
];

const MARKET_NEWS_EXCLUDE_KEYWORDS = [
  'futbol',
  'transfer',
  'magazin',
  'dizi',
  'film',
  'oyuncu',
  'survivor',
  'hava durumu',
  'deprem',
  'kaza',
  'cinayet',
  'spor',
  'galatasaray',
  'fenerbahce',
  'besiktas',
  'trabzonspor',
];

const DEFAULT_MARKET_RATES = [
  { name: 'Dolar', symbol: 'USD', buy: 38.42, sell: 38.55, change: 0.35 },
  { name: 'Euro', symbol: 'EUR', buy: 41.18, sell: 41.34, change: -0.12 },
  { name: 'Sterlin', symbol: 'GBP', buy: 48.76, sell: 48.95, change: 0.22 },
  { name: 'Gram Altin', symbol: 'GAU', buy: 3842, sell: 3860, change: 1.15 },
  { name: '22 Ayar Altin (Gram)', symbol: 'G22', buy: 3520, sell: 3550, change: 0.6 },
  { name: 'Ceyrek Altin', symbol: 'QAU', buy: 6350, sell: 6450, change: 0.85 },
  { name: 'Yarim Altin', symbol: 'HAU', buy: 12700, sell: 12900, change: 0.9 },
  { name: 'Tam Altin', symbol: 'TAU', buy: 25400, sell: 25800, change: 0.95 },
  { name: 'Gumus (Gram)', symbol: 'XAG', buy: 32.1, sell: 32.6, change: -0.2 },
];

let marketTickerCache = {
  payload: null,
  fetchedAt: 0,
};

let marketNewsCache = {
  payload: null,
  fetchedAt: 0,
  dayKey: null,
};

const marketNewsSubscribers = new Set();

const rssParser = new Parser({ timeout: 8000 });

const getTrDateParts = (dateValue = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: MARKET_NEWS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(dateValue);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return {
    year,
    month,
    day,
  };
};

const getTrDayKey = (dateValue = new Date()) => {
  const { year, month, day } = getTrDateParts(dateValue);
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const isSameTrDay = (value, referenceDate = new Date()) => {
  if (!value) return false;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const refDay = getTrDayKey(referenceDate);
  const targetDay = getTrDayKey(parsed);
  return Boolean(refDay && targetDay && refDay === targetDay);
};

const parseNewsDateToIso = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const compact = raw.replace(/\s+/g, ' ');

  // Example: 2026-04-03 14:25:00 (no timezone in source)
  const ymdMatch = compact.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (ymdMatch) {
    const [, year, month, day, hour, minute, second = '00'] = ymdMatch;
    const tzDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
    if (!Number.isNaN(tzDate.getTime())) {
      return tzDate.toISOString();
    }
  }

  // Example: 03.04.2026 14:25:00 (TR style, no timezone in source)
  const dmyMatch = compact.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyMatch) {
    const [, day, month, year, hour, minute, second = '00'] = dmyMatch;
    const dd = day.padStart(2, '0');
    const mm = month.padStart(2, '0');
    const tzDate = new Date(`${year}-${mm}-${dd}T${hour}:${minute}:${second}+03:00`);
    if (!Number.isNaN(tzDate.getTime())) {
      return tzDate.toISOString();
    }
  }

  return null;
};

const normalizeNewsItem = (item) => {
  const title = String(item?.title || '').trim();
  if (!title) return null;

  const link = String(item?.link || '').trim() || null;
  const rawDate = item?.isoDate || item?.pubDate || item?.published || null;
  const date = parseNewsDateToIso(rawDate);

  return {
    title,
    link,
    date,
  };
};

const normalizeNewsText = (value) => String(value || '')
  .toLocaleLowerCase('tr-TR')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '');

const computeMarketImpactScore = (title) => {
  const text = normalizeNewsText(title);
  if (!text) return 0;

  if (MARKET_NEWS_EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 0;
  }

  let score = 0;

  MARKET_NEWS_STRONG_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword)) score += 3;
  });

  MARKET_NEWS_SUPPORTING_KEYWORDS.forEach((keyword) => {
    if (text.includes(keyword)) score += 1;
  });

  if (/\b%\s*\d|\d+\s*(baz puan|bp)\b/.test(text)) {
    score += 1;
  }

  return score;
};

const dedupeNewsByTitle = (items) => {
  const seen = new Set();
  const output = [];

  items.forEach((item) => {
    const normalized = normalizeNewsText(item.title)
      .replace(/\s*-\s*[^-]+$/, '')
      .trim();

    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(item);
  });

  return output;
};

const getNewsIdentity = (item) => [item?.link || '', item?.title || '', item?.date || ''].join('|');

const sortNewsByDateDesc = (items) => [...items].sort((a, b) => {
  const aTime = a?.date ? new Date(a.date).getTime() : 0;
  const bTime = b?.date ? new Date(b.date).getTime() : 0;
  return bTime - aTime;
});

const publishNewsEvent = (eventName, payload) => {
  const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const subscriber of marketNewsSubscribers) {
    try {
      subscriber.write(body);
    } catch {
      marketNewsSubscribers.delete(subscriber);
    }
  }
};

const loadMarketNews = async () => {
  const now = new Date();
  const todayKey = getTrDayKey(now);
  const failures = [];
  const allItems = [];

  for (const feedUrl of MARKET_NEWS_FEEDS) {
    try {
      const feed = await rssParser.parseURL(feedUrl);
      const items = Array.isArray(feed?.items) ? feed.items : [];
      allItems.push(...items.map(normalizeNewsItem).filter(Boolean));
    } catch (error) {
      failures.push(`${feedUrl}:${error instanceof Error ? error.message : 'unknown-error'}`);
    }
  }

  const scored = allItems
    .map((item) => ({
      ...item,
      impactScore: computeMarketImpactScore(item.title),
    }))
    .filter((item) => item.impactScore >= 3)
    .filter((item) => isSameTrDay(item.date, now))
    .sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      // Keep importance as secondary ordering only when timestamps are equal.
      return b.impactScore - a.impactScore;
    });

  const news = dedupeNewsByTitle(scored)
    .map(({ impactScore, ...item }) => item)
    .slice(0, MARKET_NEWS_LIMIT);

  if (news.length > 0) {
    return {
      news,
      source: 'multi-feed',
      updatedAt: new Date().toISOString(),
      dayKey: todayKey,
      timezone: MARKET_NEWS_TZ,
    };
  }

  throw new Error(failures.join(' | ') || 'no-important-news-for-today');
};

const refreshMarketNewsCache = async ({ broadcast = false } = {}) => {
  const currentDayKey = getTrDayKey(new Date());

  if (marketNewsCache.dayKey && currentDayKey && marketNewsCache.dayKey !== currentDayKey) {
    marketNewsCache = {
      payload: {
        news: [],
        source: 'daily-reset',
        updatedAt: new Date().toISOString(),
        dayKey: currentDayKey,
        timezone: MARKET_NEWS_TZ,
      },
      fetchedAt: Date.now(),
      dayKey: currentDayKey,
    };

    if (broadcast) {
      publishNewsEvent('news:reset', {
        type: 'news:reset',
        dayKey: currentDayKey,
        timezone: MARKET_NEWS_TZ,
      });
      publishNewsEvent('news:snapshot', {
        type: 'news:snapshot',
        news: [],
        updatedAt: new Date().toISOString(),
        dayKey: currentDayKey,
        timezone: MARKET_NEWS_TZ,
      });
    }
  }

  const payload = await loadMarketNews();
  const previousDayKey = marketNewsCache.dayKey;
  const previousNews = Array.isArray(marketNewsCache.payload?.news) ? marketNewsCache.payload.news : [];
  const previousIds = new Set(previousNews.map(getNewsIdentity));

  marketNewsCache = {
    payload,
    fetchedAt: Date.now(),
    dayKey: payload.dayKey || getTrDayKey(new Date()),
  };

  if (broadcast) {
    if (previousDayKey && payload.dayKey && previousDayKey !== payload.dayKey) {
      publishNewsEvent('news:reset', {
        type: 'news:reset',
        dayKey: payload.dayKey,
        timezone: MARKET_NEWS_TZ,
      });

      publishNewsEvent('news:snapshot', {
        type: 'news:snapshot',
        news: payload.news,
        updatedAt: payload.updatedAt,
        dayKey: payload.dayKey,
        timezone: MARKET_NEWS_TZ,
      });

      return payload;
    }

    const newItems = sortNewsByDateDesc(payload.news.filter((item) => !previousIds.has(getNewsIdentity(item))));
    newItems.forEach((item) => {
      publishNewsEvent('news:new', {
        type: 'news:new',
        item,
        updatedAt: payload.updatedAt,
        dayKey: payload.dayKey,
        timezone: MARKET_NEWS_TZ,
      });
    });
  }

  return payload;
};

const parseTrNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value)
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (!raw) return null;

  let normalized = raw;

  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(/,/g, '.');
  } else {
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 1) {
      const lastDotIndex = raw.lastIndexOf('.');
      normalized = `${raw.slice(0, lastDotIndex).replace(/\./g, '')}.${raw.slice(lastDotIndex + 1)}`;
    }
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseUpstreamUpdateDateToIso = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Truncgil format example: "2026-04-02 16:30:07" in TR timezone
  const normalized = raw.replace(' ', 'T');
  const date = new Date(`${normalized}+03:00`);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return null;
};

const applyHouseSpread = (rates) => {
  const totalSpreadBySymbol = {
    USD: 0.08,
    EUR: 0.2,
    GBP: 0.28,
  };
  const goldSymbols = new Set(['GAU', 'G22', 'QAU', 'HAU', 'TAU']);
  const goldTotalSpreadPercent = 0.0224; // ~2.24% total spread (about 150 TL near 6700 TL)
  const defaultTotalSpread = 0.04;

  if (!Array.isArray(rates)) return rates;
  return rates.map((rate) => {
    const upstreamBuy = Number(rate.buy);
    const upstreamSell = Number(rate.sell);
    const midpointCandidates = [upstreamBuy, upstreamSell].filter((value) => Number.isFinite(value) && value > 0);
    const midpoint = midpointCandidates.length === 2
      ? (midpointCandidates[0] + midpointCandidates[1]) / 2
      : midpointCandidates[0] ?? null;

    if (!Number.isFinite(midpoint) || midpoint <= 0) {
      return rate;
    }

    const symbol = String(rate.symbol || '').toUpperCase();
    const totalSpread = goldSymbols.has(symbol)
      ? midpoint * goldTotalSpreadPercent
      : Number(totalSpreadBySymbol[symbol] ?? defaultTotalSpread);
    const halfSpread = totalSpread / 2;

    const buy = Number(Math.max(midpoint - halfSpread, 0).toFixed(6));
    const sell = Number((midpoint + halfSpread).toFixed(6));
    return {
      ...rate,
      upstreamBuy: Number.isFinite(upstreamBuy) ? Number(upstreamBuy.toFixed(6)) : null,
      upstreamSell: Number.isFinite(upstreamSell) ? Number(upstreamSell.toFixed(6)) : null,
      spread: Number(totalSpread.toFixed(6)),
      buy,
      sell,
    };
  });
};

const appendEurUsdParity = (rates) => {
  if (!Array.isArray(rates) || rates.length === 0) return rates;

  const usd = rates.find((rate) => rate.symbol === 'USD');
  const eur = rates.find((rate) => rate.symbol === 'EUR');
  if (!usd || !eur) return rates;

  const usdBuy = Number(usd.buy);
  const usdSell = Number(usd.sell);
  const eurBuy = Number(eur.buy);
  const eurSell = Number(eur.sell);

  if (![usdBuy, usdSell, eurBuy, eurSell].every((value) => Number.isFinite(value) && value > 0)) {
    return rates;
  }

  // Cross parity with bid/ask logic.
  const buy = Number((eurBuy / usdSell).toFixed(6));
  const sell = Number((eurSell / usdBuy).toFixed(6));
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
    return rates;
  }

  const parity = {
    name: 'Eur/Usd',
    symbol: 'EURUSD',
    buy,
    sell,
    change: 0,
    upstreamBuy: buy,
    upstreamSell: sell,
    spread: Number(Math.abs(sell - buy).toFixed(6)),
  };

  const withoutExisting = rates.filter((rate) => rate.symbol !== 'EURUSD');
  const eurIndex = withoutExisting.findIndex((rate) => rate.symbol === 'EUR');
  if (eurIndex === -1) {
    return [...withoutExisting, parity];
  }

  return [
    ...withoutExisting.slice(0, eurIndex + 1),
    parity,
    ...withoutExisting.slice(eurIndex + 1),
  ];
};

const fetchJson = async (url) => {
  if (typeof fetch === 'function') {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Upstream HTTP ${response.status}`);
    }
    return response.json();
  }

  const transport = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Upstream HTTP ${res.statusCode || 0}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Upstream timeout'));
    });
  });
};

const normalizeMarketTickerPayload = (upstreamData) => {
  const source = upstreamData && typeof upstreamData === 'object' ? upstreamData : {};

  const findEntry = (keys) => {
    for (const key of keys) {
      if (source[key] && typeof source[key] === 'object') {
        return source[key];
      }
    }
    return null;
  };

  const buildRate = (name, symbol, keys) => {
    const entry = findEntry(keys);
    if (!entry) return null;
    const buy = parseTrNumber(entry.Alış ?? entry.Alis ?? entry.alis ?? entry.buy);
    const sell = parseTrNumber(entry.Satış ?? entry.Satis ?? entry.satis ?? entry.sell);
    const change = parseTrNumber(entry.Değişim ?? entry.Degisim ?? entry.degisim ?? entry.change ?? 0) ?? 0;
    const finalBuy = buy ?? sell;
    const finalSell = sell ?? buy;
    if (finalBuy === null || finalSell === null) {
      return null;
    }
    return { name, symbol, buy: finalBuy, sell: finalSell, change };
  };

  const rates = [
    buildRate('Dolar', 'USD', ['USD', 'ABD DOLARI', 'Dolar']),
    buildRate('Euro', 'EUR', ['EUR', 'EURO', 'Euro']),
    buildRate('Sterlin', 'GBP', ['GBP', 'İNGİLİZ STERLİNİ', 'INGILIZ STERLINI', 'Sterlin']),
    buildRate('Gram Altin', 'GAU', ['gram-altin', 'GRAM ALTIN', 'Gram Altin']),
    buildRate('22 Ayar Altin (Gram)', 'G22', ['altin-22', '22 AYAR BILEZIK', '22 Ayar Altin']),
    buildRate('Ceyrek Altin', 'QAU', ['ceyrek-altin', 'ÇEYREK ALTIN', 'CEYREK ALTIN']),
    buildRate('Yarim Altin', 'HAU', ['yarim-altin', 'YARIM ALTIN']),
    buildRate('Tam Altin', 'TAU', ['tam-altin', 'TAM ALTIN']),
    buildRate('Gumus (Gram)', 'XAG', ['gumus', 'gümüş', 'GUMUS']),
  ].filter(Boolean);

  if (rates.length === 0) {
    throw new Error('No valid market rows in upstream payload');
  }

  const upstreamUpdatedAt = parseUpstreamUpdateDateToIso(source.Update_Date);
  const fetchedAt = new Date().toISOString();

  return {
    rates,
    updatedAt: fetchedAt,
    source: 'truncgil',
    fetchedAt,
    upstreamUpdatedAt: upstreamUpdatedAt || null,
  };
};

const normalizeErcilTickerPayload = (upstreamData, fallbackPayload) => {
  const rows = Array.isArray(upstreamData) ? upstreamData : null;
  if (!rows || rows.length === 0) {
    throw new Error('Ercil payload missing rows');
  }

  const baseRates = Array.isArray(fallbackPayload?.rates) && fallbackPayload.rates.length > 0
    ? fallbackPayload.rates
    : DEFAULT_MARKET_RATES;

  const rowByKod = new Map(
    rows
      .filter((row) => row && typeof row === 'object' && row.kod)
      .map((row) => [String(row.kod).toLowerCase(), row]),
  );

  const getBaseRate = (symbol) => baseRates.find((rate) => rate.symbol === symbol) || null;
  const getBaseChange = (symbol) => {
    const row = getBaseRate(symbol);
    return row && Number.isFinite(Number(row.change)) ? Number(row.change) : 0;
  };

  const buildDirectRate = (name, symbol, kod) => {
    const row = rowByKod.get(kod);
    if (!row) return null;

    const buy = parseTrNumber(row.alisfiyati);
    const sell = parseTrNumber(row.satisfiyati);
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) return null;

    const upstreamBuy = parseTrNumber(row.alisfiyatiharem ?? row.alisfiyati);
    const upstreamSell = parseTrNumber(row.satisfiyatiharem ?? row.satisfiyati);
    const change = parseTrNumber(row.degisim ?? row.Degisim ?? row.change);

    return {
      name,
      symbol,
      buy: Number(buy.toFixed(6)),
      sell: Number(sell.toFixed(6)),
      change: Number.isFinite(change) ? Number(change.toFixed(2)) : getBaseChange(symbol),
      upstreamBuy: Number.isFinite(upstreamBuy) ? Number(upstreamBuy.toFixed(6)) : Number(buy.toFixed(6)),
      upstreamSell: Number.isFinite(upstreamSell) ? Number(upstreamSell.toFixed(6)) : Number(sell.toFixed(6)),
      spread: Number(Math.abs(sell - buy).toFixed(6)),
    };
  };

  const gauRate = buildDirectRate('Gram Altin', 'GAU', 'has');
  const usdRate = buildDirectRate('Dolar', 'USD', 'usd');
  const eurRate = buildDirectRate('Euro', 'EUR', 'eur');
  const gbpRate = buildDirectRate('Sterlin', 'GBP', 'sterlin');
  const xagRate = buildDirectRate('Gumus (Gram)', 'XAG', 'silver');

  const deriveGoldRate = (name, symbol) => {
    if (!gauRate) return null;

    const gauBase = getBaseRate('GAU');
    const targetBase = getBaseRate(symbol);
    if (!gauBase || !targetBase || !Number(gauBase.buy) || !Number(gauBase.sell)) {
      return null;
    }

    const buyRatio = Number(targetBase.buy) / Number(gauBase.buy);
    const sellRatio = Number(targetBase.sell) / Number(gauBase.sell);
    if (!Number.isFinite(buyRatio) || !Number.isFinite(sellRatio)) {
      return null;
    }

    const buy = Number((gauRate.buy * buyRatio).toFixed(6));
    const sell = Number((gauRate.sell * sellRatio).toFixed(6));
    const upstreamBuy = Number((Number(gauRate.upstreamBuy ?? gauRate.buy) * buyRatio).toFixed(6));
    const upstreamSell = Number((Number(gauRate.upstreamSell ?? gauRate.sell) * sellRatio).toFixed(6));

    return {
      name,
      symbol,
      buy,
      sell,
      change: Number(gauRate.change ?? getBaseChange('GAU')),
      upstreamBuy,
      upstreamSell,
      spread: Number(Math.abs(sell - buy).toFixed(6)),
    };
  };

  const rates = [
    usdRate,
    eurRate,
    gbpRate,
    gauRate,
    deriveGoldRate('22 Ayar Altin (Gram)', 'G22'),
    deriveGoldRate('Ceyrek Altin', 'QAU'),
    deriveGoldRate('Yarim Altin', 'HAU'),
    deriveGoldRate('Tam Altin', 'TAU'),
    xagRate,
  ].filter(Boolean);

  if (rates.length === 0) {
    throw new Error('No valid Ercil rates in upstream payload');
  }

  const ratesWithParity = appendEurUsdParity(rates);

  const rawUpdatedAt = rows[0]?.tarih ?? null;
  const upstreamUpdatedAt = parseUpstreamUpdateDateToIso(rawUpdatedAt);
  const fetchedAt = new Date().toISOString();

  return {
    rates: ratesWithParity,
    updatedAt: fetchedAt,
    source: 'house',
    fetchedAt,
    upstreamUpdatedAt: upstreamUpdatedAt || null,
    upstreamSource: 'ercil-panel',
    fxSource: 'ercil-panel',
    metalsSource: 'ercil-panel',
  };
};

const readChatArchive = async () => {
  try {
    const raw = await fs.readFile(chatArchivePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      general: Array.isArray(parsed.general) ? parsed.general : [],
      private: Array.isArray(parsed.private) ? parsed.private : [],
    };
  } catch {
    return { general: [], private: [] };
  }
};

const PROFILE_UPDATABLE_FIELDS = [
  "full_name",
  "office_name",
  "phone",
  "gsm",
  "city",
  "district",
  "address",
];

const PROFILE_FIELD_INPUT_MAP = {
  name: "full_name",
  officeName: "office_name",
  phone: "phone",
  gsm: "gsm",
  city: "city",
  district: "district",
  address: "address",
};

const sanitizeNullableText = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureUsersTable = async () => {
  try {
    // Try to create the table if it doesn't exist
    await query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_approved BOOLEAN NOT NULL DEFAULT FALSE,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      full_name VARCHAR(120) NULL,
      office_name VARCHAR(120) NULL,
      phone VARCHAR(40) NULL,
      gsm VARCHAR(40) NULL,
      city VARCHAR(80) NULL,
      district VARCHAR(80) NULL,
      address TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Error creating users table:', err.message);
  }

  // Always ensure all critical columns exist (for existing tables)
  const columnsToAdd = [
    ["is_approved", "BOOLEAN NOT NULL DEFAULT FALSE"],
    ["role", "ENUM('admin','user') NOT NULL DEFAULT 'user'"],
    ["is_active", "BOOLEAN NOT NULL DEFAULT TRUE"],
    ["full_name", "VARCHAR(120) NULL"],
    ["office_name", "VARCHAR(120) NULL"],
    ["phone", "VARCHAR(40) NULL"],
    ["gsm", "VARCHAR(40) NULL"],
    ["city", "VARCHAR(80) NULL"],
    ["district", "VARCHAR(80) NULL"],
    ["address", "TEXT NULL"],
    ["created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"]
  ];

  for (const [colName, colType] of columnsToAdd) {
    try {
      await query(`ALTER TABLE users ADD COLUMN ${colName} ${colType}`);
      console.log(`✓ Added column: ${colName}`);
    } catch (err) {
      // Column likely already exists, skip silently
      if (!err.message.includes('Duplicate column')) {
        console.log(`ℹ Column ${colName} check: ${err.message.substring(0, 50)}`);
      }
    }
  }
  console.log('✓ Users table schema verified');
};

const ensureProfileUpdateRequestsTable = async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS profile_update_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      requested_fields JSON NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      reviewed_by INT NULL,
      rejection_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL,
      INDEX idx_profile_update_user_id (user_id),
      INDEX idx_profile_update_status (status)
    )`);
    console.log('✓ Profile update requests table verified');
  } catch (err) {
    console.error('Error creating profile_update_requests table:', err.message);
  }
};

const ensureAdminUser = async () => {
  const email = 'muratsecmenn@gmail.com';
  const plainPassword = 'Murat-17';
  const username = 'murat.admin';
  const fullName = 'Murat Secmen';

  const existing = await query('SELECT id, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  if (existing.length === 0) {
    await query(
      `INSERT INTO users (
        username, email, password_hash, is_approved, role, is_active,
        full_name, office_name, city, district, address
      ) VALUES (?, ?, ?, TRUE, 'admin', TRUE, ?, ?, ?, ?, ?)`,
      [username, email, passwordHash, fullName, 'DovizTrade Yonetim', 'Istanbul', 'Merkez', 'Istanbul / Merkez']
    );
    return;
  }

  await query(
    `UPDATE users
     SET role = 'admin', is_approved = TRUE, is_active = TRUE,
         full_name = COALESCE(full_name, ?),
         office_name = COALESCE(office_name, ?),
         city = COALESCE(city, ?),
         district = COALESCE(district, ?),
         address = COALESCE(address, ?)
     WHERE email = ?`,
    [fullName, 'DovizTrade Yonetim', 'Istanbul', 'Merkez', 'Istanbul / Merkez', email]
  );
};

const initializeAuthSchema = async () => {
  try {
    await query('SELECT 1');
    console.log('MySQL baglantisi basarili!');
    await ensureUsersTable();
    await ensureProfileUpdateRequestsTable();
    await ensureAdminUser();
    console.log('Auth schema hazir.');
  } catch (schemaErr) {
    console.error('Auth schema hazirlama hatasi:', schemaErr.message);
  }
};

initializeAuthSchema();

app.post('/api/auth/register', async (req, res) => {
  const {
    officeName,
    name,
    username,
    email,
    phone,
    gsm,
    city,
    district,
    address,
    password
  } = req.body;

  if (!username || !email || !password || !name) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (
        username, email, password_hash, is_approved, role, is_active,
        full_name, office_name, phone, gsm, city, district, address
      ) VALUES (?, ?, ?, FALSE, 'user', TRUE, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(username).toLowerCase(),
        String(email).toLowerCase(),
        passwordHash,
        name,
        officeName || null,
        phone || null,
        gsm || null,
        city || null,
        district || null,
        address || null
      ]
    );
    res.status(201).json({ message: 'Kayit basvurunuz yonetici onayina gonderildi.' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Bu e-posta veya kullanici adi zaten kayitli.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve sifre gerekli.' });
  }

  try {
    const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email).toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'E-posta veya sifre hatali.' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Hesabiniz engellenmis.' });
    }
    if (!user.is_approved) {
      return res.status(403).json({ error: 'Hesabiniz henuz yonetici tarafindan onaylanmadi.' });
    }

    const stored = String(user.password_hash || '');
    const isHash = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
    const validPassword = isHash ? await bcrypt.compare(password, stored) : password === stored;
    if (!validPassword) {
      return res.status(401).json({ error: 'E-posta veya sifre hatali.' });
    }

    if (!isHash) {
      const upgradedHash = await bcrypt.hash(password, 10);
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [upgradedHash, user.id]);
    }

    res.json({
      user: {
        id: user.id,
        name: user.full_name || user.username,
        officeName: user.office_name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        gsm: user.gsm,
        city: user.city,
        district: user.district,
        address: user.address,
        location: [user.city, user.district].filter(Boolean).join(' / ') || 'Belirtilmedi',
        role: user.role,
        isActive: Boolean(user.is_active),
        isApproved: Boolean(user.is_approved)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id/password', async (req, res) => {
  const userId = Number(req.params.id);
  const { currentPassword, newPassword } = req.body || {};

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }

  if (!/^[a-z0-9!@#$%^&*._-]{6,}$/.test(String(newPassword))) {
    return res.status(400).json({ error: 'Yeni sifre kurallara uygun degil.' });
  }

  try {
    const rows = await query('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    }

    const user = rows[0];
    const stored = String(user.password_hash || '');
    const isHash = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
    const validPassword = isHash ? await bcrypt.compare(currentPassword, stored) : currentPassword === stored;
    if (!validPassword) {
      return res.status(401).json({ error: 'Mevcut sifre hatali.' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    return res.json({ message: 'Sifre basariyla degistirildi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/profile-update-request', async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Gecersiz kullanici.' });
  }

  try {
    const users = await query(
      `SELECT id, full_name, office_name, phone, gsm, city, district, address
       FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    }

    const current = users[0];
    const changed = {};

    Object.entries(PROFILE_FIELD_INPUT_MAP).forEach(([inputKey, dbField]) => {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, inputKey)) return;
      const newValue = sanitizeNullableText(req.body[inputKey]);
      const oldValue = sanitizeNullableText(current[dbField]);
      if (newValue !== oldValue) {
        changed[dbField] = newValue;
      }
    });

    if (Object.keys(changed).length === 0) {
      return res.status(400).json({ error: 'Degisen profil bilgisi bulunamadi.' });
    }

    const existing = await query(
      `SELECT id FROM profile_update_requests
       WHERE user_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (existing.length > 0) {
      await query(
        `UPDATE profile_update_requests
         SET requested_fields = ?, created_at = CURRENT_TIMESTAMP, reviewed_by = NULL, rejection_reason = NULL, reviewed_at = NULL
         WHERE id = ?`,
        [JSON.stringify(changed), existing[0].id],
      );
      return res.json({ message: 'Profil degisiklik talebiniz guncellendi ve yonetici onayina sunuldu.' });
    }

    await query(
      `INSERT INTO profile_update_requests (user_id, requested_fields, status)
       VALUES (?, ?, 'pending')`,
      [userId, JSON.stringify(changed)],
    );

    return res.status(201).json({ message: 'Profil degisiklik talebiniz yonetici onayina gonderildi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/pending-users', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, username, email, full_name, office_name, phone, gsm, city, district, address, is_approved, is_active, role, created_at
       FROM users
       WHERE role = 'user' AND is_approved = FALSE
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, username, email, full_name, office_name, phone, gsm, city, district, address, is_approved, is_active, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/profile-update-requests', async (req, res) => {
  try {
    const rows = await query(
      `SELECT
          r.id,
          r.user_id,
          r.requested_fields,
          r.status,
          r.created_at,
          u.full_name,
          u.office_name,
          u.email,
          u.phone,
          u.gsm,
          u.city,
          u.district,
          u.address
       FROM profile_update_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`,
    );

    const result = rows.map((row) => {
      let requested = {};
      try {
        requested = typeof row.requested_fields === 'string'
          ? JSON.parse(row.requested_fields)
          : (row.requested_fields || {});
      } catch {
        requested = {};
      }

      const changes = Object.keys(requested)
        .filter((key) => PROFILE_UPDATABLE_FIELDS.includes(key))
        .map((key) => ({
          field: key,
          oldValue: row[key] ?? null,
          newValue: requested[key] ?? null,
        }));

      return {
        id: row.id,
        user_id: row.user_id,
        full_name: row.full_name,
        office_name: row.office_name,
        email: row.email,
        created_at: row.created_at,
        changes,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/chat-archive', async (req, res) => {
  const adminUserId = Number(req.query.adminUserId || 0);
  const requestedDays = Number(req.query.days || 7);
  const days = Number.isFinite(requestedDays) ? Math.min(7, Math.max(1, requestedDays)) : 7;

  if (!adminUserId) {
    return res.status(400).json({ error: 'Gecersiz yonetici bilgisi.' });
  }

  try {
    const admins = await query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [adminUserId]);
    if (admins.length === 0 || admins[0].role !== 'admin') {
      return res.status(403).json({ error: 'Bu islem icin yonetici yetkisi gerekli.' });
    }

    const archive = await readChatArchive();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const filterByDate = (item) => {
      const ms = new Date(item?.sentAt).getTime();
      return Number.isFinite(ms) && ms >= cutoff;
    };

    return res.json({
      days,
      general: archive.general.filter(filterByDate),
      private: archive.private.filter(filterByDate),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/profile-update-requests/:id/approve', async (req, res) => {
  const requestId = Number(req.params.id);
  if (!requestId) {
    return res.status(400).json({ error: 'Gecersiz talep.' });
  }

  try {
    const rows = await query(
      `SELECT id, user_id, requested_fields, status
       FROM profile_update_requests
       WHERE id = ? LIMIT 1`,
      [requestId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Talep bulunamadi.' });
    }

    const requestRow = rows[0];
    if (requestRow.status !== 'pending') {
      return res.status(400).json({ error: 'Talep zaten islenmis.' });
    }

    let requested = {};
    try {
      requested = typeof requestRow.requested_fields === 'string'
        ? JSON.parse(requestRow.requested_fields)
        : (requestRow.requested_fields || {});
    } catch {
      requested = {};
    }

    const updates = Object.entries(requested)
      .filter(([key]) => PROFILE_UPDATABLE_FIELDS.includes(key));

    if (updates.length > 0) {
      const setClause = updates.map(([key]) => `${key} = ?`).join(', ');
      const values = updates.map(([, value]) => sanitizeNullableText(value));
      await query(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, requestRow.user_id]);
    }

    await query(
      `UPDATE profile_update_requests
       SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [requestId],
    );

    return res.json({ message: 'Profil degisikligi onaylandi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/profile-update-requests/:id/reject', async (req, res) => {
  const requestId = Number(req.params.id);
  const rejectionReason = sanitizeNullableText(req.body?.reason);
  if (!requestId) {
    return res.status(400).json({ error: 'Gecersiz talep.' });
  }

  try {
    const rows = await query(
      `SELECT id, status FROM profile_update_requests WHERE id = ? LIMIT 1`,
      [requestId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Talep bulunamadi.' });
    }
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Talep zaten islenmis.' });
    }

    await query(
      `UPDATE profile_update_requests
       SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rejectionReason, requestId],
    );
    return res.json({ message: 'Profil degisikligi reddedildi.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/approve', async (req, res) => {
  try {
    const result = await query("UPDATE users SET is_approved = TRUE WHERE id = ? AND role = 'user'", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    }
    res.json({ message: 'Kullanici onaylandi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/active', async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active boolean olmali.' });
  }

  try {
    const result = await query("UPDATE users SET is_active = ? WHERE id = ? AND role = 'user'", [is_active, req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    }
    res.json({ message: is_active ? 'Kullanici aktif edildi.' : 'Kullanici engellendi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const result = await query("DELETE FROM users WHERE id = ? AND role = 'user' AND is_approved = FALSE", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Basvuru bulunamadi.' });
    }
    res.json({ message: 'Basvuru reddedildi.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  const { username, email, password_hash } = req.body;
  if (!username || !email || !password_hash) return res.status(400).json({ error: 'Eksik alanlar var.' });
  const sql = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
  db.query(sql, [username, email, password_hash], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, username, email });
  });
});

app.get('/api/users', (req, res) => {
  db.query('SELECT id, username, email, full_name, office_name, city, district, role, is_active, is_approved, created_at FROM users', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/users/:id', (req, res) => {
  db.query('SELECT id, username, email, full_name, office_name, phone, gsm, city, district, address, role, is_active, is_approved, created_at FROM users WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    res.json(results[0]);
  });
});

app.patch('/api/users/:id/approve', (req, res) => {
  db.query('UPDATE users SET is_approved = TRUE WHERE id = ?', [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    res.json({ message: 'Kullanici onaylandi.' });
  });
});

app.post('/api/listings', (req, res) => {
  const { user_id, currency_id, amount, price, type } = req.body;
  if (!user_id || !currency_id || !amount || !price || !type) return res.status(400).json({ error: 'Eksik alanlar var.' });
  db.query('SELECT is_approved FROM users WHERE id = ?', [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    if (!results[0].is_approved) return res.status(403).json({ error: 'Kullanici hesabi onaylanmamis.' });
    const sql = 'INSERT INTO listings (user_id, currency_id, amount, price, type) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [user_id, currency_id, amount, price, type], (err2, result) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.status(201).json({ id: result.insertId, user_id, currency_id, amount, price, type });
    });
  });
});

app.get('/api/listings', (req, res) => {
  db.query('SELECT * FROM listings', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/listings/:id', (req, res) => {
  db.query('SELECT * FROM listings WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Ilan bulunamadi.' });
    res.json(results[0]);
  });
});

app.post('/api/transactions', (req, res) => {
  const { buyer_id, seller_id, listing_id, amount, price } = req.body;
  if (!buyer_id || !seller_id || !listing_id || !amount || !price) return res.status(400).json({ error: 'Eksik alanlar var.' });
  const sql = 'INSERT INTO transactions (buyer_id, seller_id, listing_id, amount, price) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [buyer_id, seller_id, listing_id, amount, price], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, buyer_id, seller_id, listing_id, amount, price });
  });
});

app.get('/api/transactions', (req, res) => {
  db.query('SELECT * FROM transactions', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/messages', (req, res) => {
  const { sender_id, receiver_id, content } = req.body;
  if (!sender_id || !receiver_id || !content) return res.status(400).json({ error: 'Eksik alanlar var.' });
  const sql = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)';
  db.query(sql, [sender_id, receiver_id, content], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, sender_id, receiver_id, content });
  });
});

app.get('/api/messages', (req, res) => {
  const { sender_id, receiver_id } = req.query;
  let sql = 'SELECT * FROM messages';
  let params = [];
  if (sender_id && receiver_id) {
    sql += ' WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY sent_at ASC';
    params = [sender_id, receiver_id, receiver_id, sender_id];
  } else if (sender_id) {
    sql += ' WHERE sender_id = ? ORDER BY sent_at ASC';
    params = [sender_id];
  } else if (receiver_id) {
    sql += ' WHERE receiver_id = ? ORDER BY sent_at ASC';
    params = [receiver_id];
  }
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/currencies', (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Eksik alanlar var.' });
  db.query('INSERT INTO currencies (code, name) VALUES (?, ?)', [code, name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, code, name });
  });
});

app.get('/api/currencies', (req, res) => {
  db.query('SELECT * FROM currencies', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/market/ticker', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const now = Date.now();
  const hasFreshCache = marketTickerCache.payload && now - marketTickerCache.fetchedAt < MARKET_TICKER_CACHE_MS;
  if (hasFreshCache) {
    return res.json({
      ...marketTickerCache.payload,
      cached: true,
    });
  }

  try {
    let basePayload = null;

    try {
      const truncgilRaw = await fetchJson(`https://finans.truncgil.com/today.json?ts=${Date.now()}`);
      basePayload = normalizeMarketTickerPayload(truncgilRaw);
    } catch {
      basePayload = {
        rates: DEFAULT_MARKET_RATES,
        updatedAt: new Date().toISOString(),
        source: 'default',
      };
    }

    try {
      const ercilRaw = await fetchJson(`${ERCIL_TICKER_URL}?ts=${Date.now()}`);
      const ercilPayload = normalizeErcilTickerPayload(ercilRaw, basePayload);

      console.log('[ticker] provider=ercil ok updatedAt=%s', ercilPayload.updatedAt);
      marketTickerCache = {
        payload: ercilPayload,
        fetchedAt: now,
      };

      return res.json({
        ...ercilPayload,
        cached: false,
      });
    } catch (ercilError) {
      const withSpread = {
        ...basePayload,
        source: 'house',
        upstreamSource: basePayload.source || 'truncgil',
        fxSource: basePayload.source || 'truncgil',
        metalsSource: basePayload.source || 'truncgil',
        warning: ercilError instanceof Error ? `ercil-fallback: ${ercilError.message}` : 'ercil-fallback',
        rates: appendEurUsdParity(applyHouseSpread(basePayload.rates)),
      };

      console.log('[ticker] provider=truncgil-fallback ok updatedAt=%s', withSpread.updatedAt);
      marketTickerCache = {
        payload: withSpread,
        fetchedAt: now,
      };

      return res.json({
        ...withSpread,
        cached: false,
      });
    }
  } catch (error) {
    const fallbackPayload = marketTickerCache.payload || {
      rates: DEFAULT_MARKET_RATES,
      updatedAt: new Date().toISOString(),
      source: 'default',
    };
    const fallbackWithSpread = {
      ...fallbackPayload,
      source: fallbackPayload.source === 'default' ? 'house-fallback' : 'house',
      rates: appendEurUsdParity(applyHouseSpread(fallbackPayload.rates)),
    };

    return res.status(200).json({
      ...fallbackWithSpread,
      cached: Boolean(marketTickerCache.payload),
      stale: true,
      warning: error instanceof Error ? error.message : 'ticker-fallback',
    });
  }
});

app.get('/api/market/news', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const now = Date.now();
  const currentDayKey = getTrDayKey(new Date());
  const hasFreshCache =
    marketNewsCache.payload
    && marketNewsCache.dayKey === currentDayKey
    && now - marketNewsCache.fetchedAt < MARKET_NEWS_CACHE_MS;
  if (hasFreshCache) {
    return res.status(200).json({
      ...marketNewsCache.payload,
      cached: true,
    });
  }

  try {
    const payload = await refreshMarketNewsCache({ broadcast: false });

    return res.status(200).json({
      ...payload,
      cached: false,
    });
  } catch (error) {
    const fallback = marketNewsCache.payload || {
      news: [],
      source: 'fallback',
      updatedAt: new Date().toISOString(),
      dayKey: currentDayKey,
      timezone: MARKET_NEWS_TZ,
    };

    return res.status(200).json({
      ...fallback,
      cached: Boolean(marketNewsCache.payload),
      stale: true,
      warning: error instanceof Error ? error.message : 'news-fallback',
    });
  }
});

app.get('/api/market/news/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(`event: ready\ndata: ${JSON.stringify({ type: 'ready', connectedAt: new Date().toISOString(), dayKey: getTrDayKey(new Date()), timezone: MARKET_NEWS_TZ })}\n\n`);

  if (Array.isArray(marketNewsCache.payload?.news) && marketNewsCache.payload.news.length > 0) {
    res.write(`event: news:snapshot\ndata: ${JSON.stringify({ type: 'news:snapshot', news: marketNewsCache.payload.news, updatedAt: marketNewsCache.payload.updatedAt })}\n\n`);
  }

  marketNewsSubscribers.add(res);

  const keepAliveTimer = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    marketNewsSubscribers.delete(res);
  });
});

setInterval(() => {
  refreshMarketNewsCache({ broadcast: true }).catch(() => {
    // keep background refresh resilient
  });
}, MARKET_NEWS_STREAM_POLL_MS);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portunda calisiyor.');
});
