const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
const db = new Database(path.join(__dirname, 'db.sqlite'));
db.pragma('journal_mode = WAL');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
`);

// 默认管理员
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_wuqi_2026';
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
    'admin', crypto.createHash('md5').update(ADMIN_KEY).digest('hex'), 'admin'
  );
}

app.use(express.json());
app.use(express.static(__dirname));

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });
  if (username.length < 2 || username.length > 12) return res.status(400).json({ error: '用户名2-12个字' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  try {
    const hash = crypto.createHash('md5').update(password).digest('hex');
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    res.json({ id: result.lastInsertRowid, username, role: 'user' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const hash = crypto.createHash('md5').update(password).digest('hex');
  const user = db.prepare('SELECT id, username, role FROM users WHERE username = ? AND password = ?').get(username, hash);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  res.json(user);
});

// 获取帖子列表
app.get('/api/posts', (req, res) => {
  const { category } = req.query;
  let sql = `SELECT p.*, u.username as author_name FROM posts p JOIN users u ON p.author_id = u.id`;
  const params = [];
  if (category && category !== '全部') {
    sql += ' WHERE p.category = ?';
    params.push(category);
  }
  sql += ' ORDER BY p.is_pinned DESC, p.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// 获取单个帖子
app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare(`SELECT p.*, u.username as author_name FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const comments = db.prepare(`SELECT c.*, u.username as author_name FROM comments c JOIN users u ON c.author_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC`).all(req.params.id);
  res.json({ ...post, comments });
});

// 发帖
app.post('/api/posts', (req, res) => {
  const { title, content, category, author_id } = req.body;
  if (!title || !content || !category) return res.status(400).json({ error: '请填写完整' });
  const result = db.prepare('INSERT INTO posts (title, content, category, author_id) VALUES (?, ?, ?, ?)').run(title, content, category, author_id);
  res.json({ id: result.lastInsertRowid });
});

// 评论
app.post('/api/posts/:id/comments', (req, res) => {
  const { content, author_id } = req.body;
  if (!content) return res.status(400).json({ error: '评论不能为空' });
  const result = db.prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)').run(req.params.id, author_id, content);
  res.json({ id: result.lastInsertRowid });
});

// 点赞
app.post('/api/posts/:id/like', (req, res) => {
  db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(req.params.id);
  const post = db.prepare('SELECT likes FROM posts WHERE id = ?').get(req.params.id);
  res.json({ likes: post.likes });
});

// 管理：置顶/取消置顶
app.post('/api/admin/pin/:id', (req, res) => {
  const post = db.prepare('SELECT is_pinned FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?').run(post.is_pinned ? 0 : 1, req.params.id);
  res.json({ is_pinned: !post.is_pinned });
});

// 管理：删除帖子
app.delete('/api/admin/posts/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));
