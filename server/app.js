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

const parseTrNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value)
    .replace(/%/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .trim();
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

const applyFixedHalfSpread = (rates) => {
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
    const base = Number(rate.buy);
    if (!Number.isFinite(base) || base <= 0) {
      return rate;
    }

    const symbol = String(rate.symbol || '').toUpperCase();
    const totalSpread = goldSymbols.has(symbol)
      ? base * goldTotalSpreadPercent
      : Number(totalSpreadBySymbol[symbol] ?? defaultTotalSpread);
    const halfSpread = totalSpread / 2;

    const buy = Number(Math.max(base - halfSpread, 0).toFixed(6));
    const sell = Number((base + halfSpread).toFixed(6));
    return {
      ...rate,
      buy,
      sell,
    };
  });
};

const OUNCE_TO_GRAM = 31.1034768;
const YAHOO_CHANGE_CACHE_MS = 0;

let yahoo24hChangeCache = {
  map: null,
  fetchedAt: 0,
};

const getYahooSeriesPoints = async (symbol, interval = '1h', range = '2d') => {
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&ts=${Date.now()}`);
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return [];

  return timestamps
    .map((t, i) => ({ t: Number(t), v: Number(closes[i]) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);
};

const getYahoo24hChangePercent = async (symbol) => {
  const points = await getYahooSeriesPoints(symbol, '1m', '2d');
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const targetTs = latest.t - 24 * 60 * 60;
  let base = null;

  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].t <= targetTs) {
      base = points[i];
      break;
    }
  }

  if (!base) {
    base = points[0];
  }

  if (!base || !Number.isFinite(base.v) || base.v <= 0) return null;
  const pct = ((latest.v - base.v) / base.v) * 100;
  return Number.isFinite(pct) ? Number(pct.toFixed(2)) : null;
};

const getYahoo24hChangeMap = async () => {
  const now = Date.now();
  if (yahoo24hChangeCache.map && now - yahoo24hChangeCache.fetchedAt < YAHOO_CHANGE_CACHE_MS) {
    return yahoo24hChangeCache.map;
  }

  const entries = [
    ['USD', 'USDTRY=X'],
    ['EUR', 'EURTRY=X'],
    ['GBP', 'GBPTRY=X'],
    ['GAU', 'GC=F'],
    ['XAG', 'SI=F'],
  ];

  const resolved = await Promise.all(entries.map(async ([symbol, yahooSymbol]) => {
    try {
      const value = await getYahoo24hChangePercent(yahooSymbol);
      return [symbol, value];
    } catch {
      return [symbol, null];
    }
  }));

  const map = Object.fromEntries(resolved.filter(([, value]) => Number.isFinite(value)));
  // Gold-derived rows use gram gold change.
  if (Number.isFinite(map.GAU)) {
    map.G22 = map.GAU;
    map.QAU = map.GAU;
    map.HAU = map.GAU;
    map.TAU = map.GAU;
  }
  // USDT tracks USD side for display purposes.
  if (Number.isFinite(map.USD)) {
    map.USDT = map.USD;
  }

  yahoo24hChangeCache = {
    map,
    fetchedAt: now,
  };
  return map;
};

const apply24hChanges = (payload, changeMap) => {
  if (!payload || !Array.isArray(payload.rates) || !changeMap) return payload;

  const rates = payload.rates.map((rate) => {
    const symbol = String(rate.symbol || '').toUpperCase();
    const nextChange = changeMap[symbol];
    if (!Number.isFinite(nextChange)) return rate;
    return {
      ...rate,
      change: nextChange,
    };
  });

  return {
    ...payload,
    rates,
  };
};

const getYahooLatestClose = async (symbol) => {
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&ts=${Date.now()}`);
  const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return null;

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const value = Number(closes[i]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
};

const enrichMetalsFromYahoo = async (payload) => {
  if (!payload || !Array.isArray(payload.rates)) return payload;

  const usdTry = Number(payload.rates.find((rate) => rate.symbol === 'USD')?.buy);
  if (!Number.isFinite(usdTry) || usdTry <= 0) {
    return payload;
  }

  let goldUsdOunce = null;
  let silverUsdOunce = null;

  try {
    [goldUsdOunce, silverUsdOunce] = await Promise.all([
      getYahooLatestClose('GC=F'),
      getYahooLatestClose('SI=F'),
    ]);
  } catch {
    return payload;
  }

  const gauTry = Number.isFinite(goldUsdOunce) && goldUsdOunce > 0
    ? (goldUsdOunce * usdTry) / OUNCE_TO_GRAM
    : null;

  const xagTry = Number.isFinite(silverUsdOunce) && silverUsdOunce > 0
    ? (silverUsdOunce * usdTry) / OUNCE_TO_GRAM
    : null;

  if (!gauTry && !xagTry) {
    return payload;
  }

  const currentGau = payload.rates.find((rate) => rate.symbol === 'GAU');
  const gauScale = currentGau && Number(currentGau.buy) > 0 && gauTry
    ? gauTry / Number(currentGau.buy)
    : null;

  const rates = payload.rates.map((rate) => {
    if (rate.symbol === 'GAU' && gauTry) {
      return { ...rate, buy: gauTry, sell: gauTry };
    }

    if (rate.symbol === 'XAG' && xagTry) {
      return { ...rate, buy: xagTry, sell: xagTry };
    }

    if (gauScale && ['G22', 'QAU', 'HAU', 'TAU'].includes(rate.symbol)) {
      const scaled = Number(rate.buy) * gauScale;
      return { ...rate, buy: scaled, sell: scaled };
    }

    return rate;
  });

  return {
    ...payload,
    rates,
    metalsSource: 'yahoo-futures',
  };
};

const enrichFxFromYahoo = async (payload) => {
  if (!payload || !Array.isArray(payload.rates)) return payload;

  let usdTry = null;
  let eurTry = null;
  let gbpTry = null;

  try {
    [usdTry, eurTry, gbpTry] = await Promise.all([
      getYahooLatestClose('USDTRY=X'),
      getYahooLatestClose('EURTRY=X'),
      getYahooLatestClose('GBPTRY=X'),
    ]);
  } catch {
    return payload;
  }

  const rates = payload.rates.map((rate) => {
    if (rate.symbol === 'USD' && Number.isFinite(usdTry) && usdTry > 0) {
      return { ...rate, buy: usdTry, sell: usdTry };
    }
    if (rate.symbol === 'EUR' && Number.isFinite(eurTry) && eurTry > 0) {
      return { ...rate, buy: eurTry, sell: eurTry };
    }
    if (rate.symbol === 'GBP' && Number.isFinite(gbpTry) && gbpTry > 0) {
      return { ...rate, buy: gbpTry, sell: gbpTry };
    }
    return rate;
  });

  return {
    ...payload,
    rates,
    fxSource: 'yahoo-fx',
  };
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

    const withYahooFx = await enrichFxFromYahoo(basePayload);
    const withMetals = await enrichMetalsFromYahoo(withYahooFx);
    const changeMap = await getYahoo24hChangeMap();
    const with24hChange = apply24hChanges(withMetals, changeMap);
    const withSpread = {
      ...with24hChange,
      source: 'yahoo',
      rates: applyFixedHalfSpread(with24hChange.rates),
    };

    console.log('[ticker] provider=yahoo ok updatedAt=%s', withSpread.updatedAt);
    marketTickerCache = {
      payload: withSpread,
      fetchedAt: now,
    };

    return res.json({
      ...withSpread,
      cached: false,
    });
  } catch (error) {
    const fallbackPayload = marketTickerCache.payload || {
      rates: DEFAULT_MARKET_RATES,
      updatedAt: new Date().toISOString(),
      source: 'default',
    };
    const fallbackWithSpread = {
      ...fallbackPayload,
      rates: applyFixedHalfSpread(fallbackPayload.rates),
    };

    return res.status(200).json({
      ...fallbackWithSpread,
      cached: Boolean(marketTickerCache.payload),
      stale: true,
      warning: error instanceof Error ? error.message : 'ticker-fallback',
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portunda calisiyor.');
});
