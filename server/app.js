import express from 'express';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatArchivePath = path.join(__dirname, 'chat-archive.json');
const allowedOrigins = [
  'https://doviztrade.com',
  'https://www.doviztrade.com',
  'https://sea-lion-app-2w4d4.ondigitalocean.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portunda calisiyor.');
});
