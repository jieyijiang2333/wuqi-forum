-- 无期迷途论坛 - 数据库建表语句
-- 在 Supabase SQL Editor 中执行

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '灌水闲聊',
  author_name TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  is_pinned BOOLEAN DEFAULT false,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 管理员表（简单方案：用邮箱判断）
CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 开启 RLS（行级安全）
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 帖子策略：所有人可读，登录用户可写
CREATE POLICY "帖子可读" ON posts FOR SELECT USING (true);
CREATE POLICY "帖子可插入" ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "管理员可置顶" ON posts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);
CREATE POLICY "管理员可删帖" ON posts FOR DELETE USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- 评论策略：所有人可读，登录用户可写
CREATE POLICY "评论可读" ON comments FOR SELECT USING (true);
CREATE POLICY "评论可插入" ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "管理员可删评论" ON comments FOR DELETE USING (
  EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
);

-- 管理员表策略
CREATE POLICY "管理员可读" ON admins FOR SELECT USING (true);
