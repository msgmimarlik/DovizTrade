// Kullanıcı onaylama (admin) endpointi
app.patch('/api/users/:id/approve', (req, res) => {
  const userId = req.params.id;
  db.query('UPDATE users SET is_approved = TRUE WHERE id = ?', [userId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    res.json({ message: 'Kullanıcı onaylandı.' });
  });
});
// Döviz ekleme endpointi
app.post('/api/currencies', (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }
  const sql = 'INSERT INTO currencies (code, name) VALUES (?, ?)';
  db.query(sql, [code, name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, code, name });
  });
});

// Tüm dövizleri listeleme endpointi
app.get('/api/currencies', (req, res) => {
  const sql = 'SELECT * FROM currencies';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});
// Tüm kullanıcıları listeleme endpointi
app.get('/api/users', (req, res) => {
  const sql = 'SELECT id, username, email, created_at FROM users';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Tekil kullanıcı görüntüleme endpointi
app.get('/api/users/:id', (req, res) => {
  const sql = 'SELECT id, username, email, created_at FROM users WHERE id = ?';
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    res.json(results[0]);
  });
});
// Mesaj gönderme endpointi
app.post('/api/messages', (req, res) => {
  const { sender_id, receiver_id, content } = req.body;
  if (!sender_id || !receiver_id || !content) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }
  const sql = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)';
  db.query(sql, [sender_id, receiver_id, content], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, sender_id, receiver_id, content });
  });
});

// Kullanıcılar arası mesajları listeleme endpointi
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
// İşlem ekleme endpointi
app.post('/api/transactions', (req, res) => {
  const { buyer_id, seller_id, listing_id, amount, price } = req.body;
  if (!buyer_id || !seller_id || !listing_id || !amount || !price) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }
  const sql = 'INSERT INTO transactions (buyer_id, seller_id, listing_id, amount, price) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [buyer_id, seller_id, listing_id, amount, price], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, buyer_id, seller_id, listing_id, amount, price });
  });
});

// Tüm işlemleri listeleme endpointi
app.get('/api/transactions', (req, res) => {
  const sql = 'SELECT * FROM transactions';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});
// Basit bir MySQL bağlantısı ve örnek kullanıcı ekleme endpointi
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // MySQL kullanıcı adını değiştirin
  password: '', // MySQL şifresini girin
  database: 'doviztrader' // Veritabanı adını girin
});

db.connect((err) => {
  if (err) throw err;
  console.log('MySQL bağlantısı başarılı!');
});

// Kullanıcı ekleme endpointi
app.post('/api/users', (req, res) => {
  const { username, email, password_hash } = req.body;
  if (!username || !email || !password_hash) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }
  const sql = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
  db.query(sql, [username, email, password_hash], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, username, email });
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor.`);
});


// İlan ekleme endpointi (sadece onaylı kullanıcılar için)
app.post('/api/listings', (req, res) => {
  const { user_id, currency_id, amount, price, type } = req.body;
  if (!user_id || !currency_id || !amount || !price || !type) {
    return res.status(400).json({ error: 'Eksik alanlar var.' });
  }
  // Önce kullanıcının onaylı olup olmadığını kontrol et
  db.query('SELECT is_approved FROM users WHERE id = ?', [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    if (!results[0].is_approved) return res.status(403).json({ error: 'Kullanıcı hesabı onaylanmamış.' });
    // Onaylıysa ilan ekle
    const sql = 'INSERT INTO listings (user_id, currency_id, amount, price, type) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [user_id, currency_id, amount, price, type], (err2, result) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.status(201).json({ id: result.insertId, user_id, currency_id, amount, price, type });
    });
  });
});

// Tüm ilanları listeleme endpointi
app.get('/api/listings', (req, res) => {
  const sql = 'SELECT * FROM listings';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Tekil ilan görüntüleme endpointi
app.get('/api/listings/:id', (req, res) => {
  const sql = 'SELECT * FROM listings WHERE id = ?';
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'İlan bulunamadı.' });
    res.json(results[0]);
  });
});
