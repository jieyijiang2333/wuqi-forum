// ========== Supabase 配置（纯 fetch 版，不依赖任何 CDN） ==========
const SUPABASE_URL = 'https://pmywsdyewpeyvwdacmgt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBteXdzZHlld3BleXd2ZGFjbWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTM4NDYsImV4cCI6MjA5NzE2OTg0Nn0.OmZ0O9NPNKlbixFvl-RTh7sV3E1MMwkY4KjKR3zdGq0';

// ========== Supabase REST API 封装 ==========
async function sbQuery(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + (currentUser?._token || SUPABASE_KEY),
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function sbInsert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + (currentUser?._token || SUPABASE_KEY),
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function sbUpdate(table, data, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + (currentUser?._token || SUPABASE_KEY),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
}

async function sbDelete(table, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + (currentUser?._token || SUPABASE_KEY),
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) throw new Error(await res.text());
}

// Auth: 注册
async function sbSignUp(email, password, nickname) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, data: { nickname } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || '注册失败');
    return data;
}

// Auth: 登录
async function sbSignIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || '登录失败');
    return data;
}

// Auth: 登出
async function sbSignOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    });
}

// ========== 状态 ==========
let currentUser = null; // { id, email, nickname, _token }
let isAdmin = false;
let currentCategory = '全部';
let currentPostId = null;

// ========== 初始化 ==========
function init() {
    // 从 localStorage 恢复登录状态
    const saved = localStorage.getItem('wuqi_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        checkAdmin();
        updateAuthUI();
    }
    loadPosts();
}

// 检查是否是管理员
async function checkAdmin() {
    if (!currentUser) { isAdmin = false; return; }
    try {
        const data = await sbQuery('admins', `user_id=eq.${currentUser.id}&select=user_id`);
        isAdmin = data.length > 0;
    } catch (e) {
        isAdmin = false;
    }
}

// ========== UI更新 ==========
function updateAuthUI() {
    if (currentUser) {
        document.getElementById('authArea').style.display = 'none';
        document.getElementById('userArea').style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser.nickname;
        document.getElementById('newPostArea').style.display = 'block';
    } else {
        document.getElementById('authArea').style.display = 'flex';
        document.getElementById('userArea').style.display = 'none';
        document.getElementById('newPostArea').style.display = 'none';
    }
}

// ========== 帖子操作 ==========
async function loadPosts() {
    try {
        let params = 'order=is_pinned.desc,created_at.desc&select=*';
        if (currentCategory !== '全部') {
            params += `&category=eq.${encodeURIComponent(currentCategory)}`;
        }
        const posts = await sbQuery('posts', params);
        const list = document.getElementById('postList');
        if (!posts || posts.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无帖子，快来发表第一篇吧！</div>';
            return;
        }
        list.innerHTML = posts.map(p => `
            <div class="post-card ${p.is_pinned ? 'pinned' : ''}" onclick="viewPost(${p.id})">
                <div class="post-title">${esc(p.title)}</div>
                <div class="post-meta">
                    <div>
                        <span class="post-category">${esc(p.category)}</span>
                        <span style="margin-left:8px">${esc(p.author_name)}</span>
                    </div>
                    <div class="post-stats">
                        <span>👍 ${p.likes}</span>
                        <span>${timeAgo(p.created_at)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('加载帖子失败:', e);
        document.getElementById('postList').innerHTML = '<div class="empty-state">⚠️ 加载失败，稍后刷新重试</div>';
    }
}

function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadPosts();
}

async function viewPost(id) {
    currentPostId = id;
    try {
        const posts = await sbQuery('posts', `id=eq.${id}&select=*`);
        if (!posts || posts.length === 0) { alert('帖子不存在'); return; }
        const post = posts[0];
        const comments = await sbQuery('comments', `post_id=eq.${id}&order=created_at.asc&select=*`);

        document.getElementById('page-home').style.display = 'none';
        document.getElementById('page-post').style.display = 'block';

        let adminBtns = '';
        if (isAdmin) {
            adminBtns = `
                <button class="btn btn-small admin-btn" onclick="togglePin(${post.id})">${post.is_pinned ? '取消置顶' : '置顶'}</button>
                <button class="btn btn-small admin-btn" onclick="deletePost(${post.id})">删除</button>
            `;
        }

        document.getElementById('postDetail').innerHTML = `
            <div class="title">${esc(post.title)}</div>
            <div class="meta">
                <span>👤 ${esc(post.author_name)}</span>
                <span class="post-category">${esc(post.category)}</span>
                <span>🕐 ${timeAgo(post.created_at)}</span>
            </div>
            <div class="content">${esc(post.content)}</div>
            <div class="post-actions">
                <button class="like-btn" onclick="likePost(${post.id})">👍 ${post.likes}</button>
                ${adminBtns}
            </div>
            <div class="comments-section">
                <div class="comments-title">评论 (${(comments || []).length})</div>
                ${(comments || []).length === 0 ? '<div style="color:#555;font-size:13px">暂无评论</div>' :
                    (comments || []).map(c => `
                        <div class="comment-item">
                            <div class="comment-header">
                                <span class="comment-author">${esc(c.author_name)}</span>
                                <span class="comment-time">${timeAgo(c.created_at)}</span>
                            </div>
                            <div class="comment-content">${esc(c.content)}</div>
                        </div>
                    `).join('')}
            </div>
        `;

        document.getElementById('commentArea').style.display = currentUser ? 'block' : 'none';
        window.scrollTo(0, 0);
    } catch (e) {
        console.error('加载帖子详情失败:', e);
        alert('网络超时，请重试');
    }
}

function goHome() {
    document.getElementById('page-home').style.display = 'block';
    document.getElementById('page-post').style.display = 'none';
    currentPostId = null;
    loadPosts();
}

async function likePost(id) {
    try {
        const posts = await sbQuery('posts', `id=eq.${id}&select=likes`);
        if (posts && posts.length > 0) {
            await sbUpdate('posts', { likes: posts[0].likes + 1 }, `id=eq.${id}`);
            viewPost(id);
        }
    } catch (e) { alert('操作失败，请重试'); }
}

async function togglePin(id) {
    try {
        const posts = await sbQuery('posts', `id=eq.${id}&select=is_pinned`);
        if (posts && posts.length > 0) {
            await sbUpdate('posts', { is_pinned: !posts[0].is_pinned }, `id=eq.${id}`);
            viewPost(id);
        }
    } catch (e) { alert('操作失败，请重试'); }
}

async function deletePost(id) {
    if (!confirm('确定删除这篇帖子？')) return;
    try {
        await sbDelete('comments', `post_id=eq.${id}`);
        await sbDelete('posts', `id=eq.${id}`);
        goHome();
    } catch (e) { alert('删除失败，请重试'); }
}

async function submitComment() {
    const content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');
    try {
        await sbInsert('comments', {
            post_id: currentPostId,
            author_name: currentUser.nickname,
            author_id: currentUser.id,
            content: content
        });
        document.getElementById('commentInput').value = '';
        viewPost(currentPostId);
    } catch (e) { alert('评论失败，请重试'); }
}

async function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const category = document.getElementById('postCategory').value;
    if (!title || !content) { document.getElementById('postError').textContent = '请填写标题和内容'; return; }
    try {
        await sbInsert('posts', {
            title, content, category,
            author_name: currentUser.nickname,
            author_id: currentUser.id
        });
        closeModal('newPostModal');
        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        document.getElementById('postError').textContent = '';
        loadPosts();
    } catch (e) {
        document.getElementById('postError').textContent = '发布失败，请重试';
    }
}

// ========== 弹窗控制 ==========
function showLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function showRegister() { document.getElementById('registerModal').style.display = 'flex'; }
function showNewPost() {
    if (!currentUser) return showLogin();
    document.getElementById('newPostModal').style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ========== 注册 ==========
async function doRegister() {
    const nickname = document.getElementById('regUser').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    if (!nickname || !email || !password) {
        document.getElementById('regError').textContent = '请填写完整信息';
        return;
    }
    try {
        const data = await sbSignUp(email, password, nickname);
        if (data.user) {
            // 注册成功，自动登录
            const signInData = await sbSignIn(email, password);
            currentUser = {
                id: signInData.user.id,
                email: signInData.user.email,
                nickname: nickname,
                _token: signInData.access_token
            };
            localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
            await checkAdmin();
            updateAuthUI();
            closeModal('registerModal');
            document.getElementById('regError').textContent = '';
            alert('注册成功！');
        }
    } catch (e) {
        document.getElementById('regError').textContent = e.message;
    }
}

// ========== 登录 ==========
async function doLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    if (!username || !password) {
        document.getElementById('loginError').textContent = '请填写用户名和密码';
        return;
    }
    // 用用户名查找对应的邮箱
    // 由于 Supabase 注册用的是真实邮箱，这里用昵称作为用户名
    // 用户需要用注册时的邮箱登录
    const email = username.includes('@') ? username : username + '@wuqi-forum.local';
    try {
        const data = await sbSignIn(email, password);
        currentUser = {
            id: data.user.id,
            email: data.user.email,
            nickname: data.user.user_metadata?.nickname || username,
            _token: data.access_token
        };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        await checkAdmin();
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginError').textContent = '';
        if (currentPostId) viewPost(currentPostId);
    } catch (e) {
        document.getElementById('loginError').textContent = '登录失败，请检查用户名和密码';
    }
}

// ========== 退出 ==========
async function logout() {
    if (currentUser?._token) {
        try { await sbSignOut(currentUser._token); } catch (e) {}
    }
    currentUser = null;
    isAdmin = false;
    localStorage.removeItem('wuqi_user');
    updateAuthUI();
    if (currentPostId) goHome();
}

// ========== 工具函数 ==========
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

init();