// 状态
let currentUser = null;
let currentCategory = '全部';
let currentPostId = null;

// API 请求
async function api(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
}

// 初始化
async function init() {
    const saved = localStorage.getItem('wuqi_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        updateAuthUI();
    }
    loadPosts();
}

// 更新登录状态UI
function updateAuthUI() {
    if (currentUser) {
        document.getElementById('authArea').style.display = 'none';
        document.getElementById('userArea').style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser.username;
        document.getElementById('newPostArea').style.display = 'block';
    } else {
        document.getElementById('authArea').style.display = 'flex';
        document.getElementById('userArea').style.display = 'none';
        document.getElementById('newPostArea').style.display = 'none';
    }
}

// 加载帖子
async function loadPosts() {
    try {
        const posts = await api(`/api/posts?category=${encodeURIComponent(currentCategory)}`);
        const list = document.getElementById('postList');
        if (posts.length === 0) {
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
        document.getElementById('postList').innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

// 切换分类
function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadPosts();
}

// 查看帖子详情
async function viewPost(id) {
    currentPostId = id;
    try {
        const post = await api(`/api/posts/${id}`);
        document.getElementById('page-home').style.display = 'none';
        document.getElementById('page-post').style.display = 'block';

        let adminBtns = '';
        if (currentUser && currentUser.role === 'admin') {
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
                <div class="comments-title">评论 (${post.comments.length})</div>
                ${post.comments.length === 0 ? '<div style="color:#555;font-size:13px">暂无评论</div>' :
                    post.comments.map(c => `
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
        alert('加载失败');
    }
}

// 返回列表
function goHome() {
    document.getElementById('page-home').style.display = 'block';
    document.getElementById('page-post').style.display = 'none';
    currentPostId = null;
    loadPosts();
}

// 点赞
async function likePost(id) {
    try {
        const data = await api(`/api/posts/${id}/like`, { method: 'POST' });
        viewPost(id);
    } catch (e) {}
}

// 置顶
async function togglePin(id) {
    try {
        await api(`/api/admin/pin/${id}`, { method: 'POST' });
        viewPost(id);
    } catch (e) { alert(e.message); }
}

// 删除帖子
async function deletePost(id) {
    if (!confirm('确定删除这篇帖子？')) return;
    try {
        await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
        goHome();
    } catch (e) { alert(e.message); }
}

// 发表评论
async function submitComment() {
    const content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');
    try {
        await api(`/api/posts/${currentPostId}/comments`, {
            method: 'POST',
            body: { content, author_id: currentUser.id }
        });
        document.getElementById('commentInput').value = '';
        viewPost(currentPostId);
    } catch (e) { alert(e.message); }
}

// 弹窗控制
function showLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function showRegister() { document.getElementById('registerModal').style.display = 'flex'; }
function showNewPost() {
    if (!currentUser) return showLogin();
    document.getElementById('newPostModal').style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// 登录
async function doLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    try {
        const user = await api('/api/login', { method: 'POST', body: { username, password } });
        currentUser = user;
        localStorage.setItem('wuqi_user', JSON.stringify(user));
        closeModal('loginModal');
        updateAuthUI();
        document.getElementById('loginError').textContent = '';
        if (currentPostId) viewPost(currentPostId);
    } catch (e) {
        document.getElementById('loginError').textContent = e.message;
    }
}

// 注册
async function doRegister() {
    const username = document.getElementById('regUser').value.trim();
    const password = document.getElementById('regPass').value;
    try {
        const user = await api('/api/register', { method: 'POST', body: { username, password } });
        currentUser = user;
        localStorage.setItem('wuqi_user', JSON.stringify(user));
        closeModal('registerModal');
        updateAuthUI();
        document.getElementById('regError').textContent = '';
    } catch (e) {
        document.getElementById('regError').textContent = e.message;
    }
}

// 退出
function logout() {
    currentUser = null;
    localStorage.removeItem('wuqi_user');
    updateAuthUI();
    if (currentPostId) goHome();
}

// 发帖
async function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const category = document.getElementById('postCategory').value;
    if (!title || !content) {
        document.getElementById('postError').textContent = '请填写标题和内容';
        return;
    }
    try {
        await api('/api/posts', {
            method: 'POST',
            body: { title, content, category, author_id: currentUser.id }
        });
        closeModal('newPostModal');
        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        document.getElementById('postError').textContent = '';
        loadPosts();
    } catch (e) {
        document.getElementById('postError').textContent = e.message;
    }
}

// 工具函数
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

init();