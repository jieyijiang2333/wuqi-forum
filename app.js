// ========== 配置 ==========
const REPO = 'jieyijiang2333/wuqi-forum';
const TOKEN = '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';
const API = 'https://api.github.com';
const ADMIN_NICK = 'jieyijiang2333'; // 管理员昵称

const HEADERS = {
    'Authorization': 'token ' + TOKEN,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
};

// ========== 状态 ==========
let currentUser = null; // { nickname, isAdmin }
let currentCategory = '全部';
let currentPostId = null;

// ========== GitHub API 封装 ==========
async function gh(method, path, body) {
    const opts = { method, headers: HEADERS };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '请求失败');
    return data;
}

// ========== 初始化 ==========
function init() {
    const saved = localStorage.getItem('wuqi_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        updateAuthUI();
    }
    loadPosts();
}

// ========== UI ==========
function updateAuthUI() {
    if (currentUser) {
        document.getElementById('authArea').style.display = 'none';
        document.getElementById('userArea').style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser.nickname + (currentUser.isAdmin ? ' 👑' : '');
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
        let issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=帖子&per_page=100&sort=created&direction=desc`);

        // 置顶的排前面
        issues.sort((a, b) => {
            const aPin = a.labels.some(l => l.name === '置顶') ? 1 : 0;
            const bPin = b.labels.some(l => l.name === '置顶') ? 1 : 0;
            if (bPin !== aPin) return bPin - aPin;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        const list = document.getElementById('postList');
        if (!issues || issues.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无帖子，快来发表第一篇吧！</div>';
            return;
        }
        list.innerHTML = issues.map(issue => {
            const meta = parseMeta(issue.body);
            const pinned = issue.labels.some(l => l.name === '置顶');
            const cat = meta.category || '灌水闲聊';
            if (currentCategory !== '全部' && cat !== currentCategory) return '';
            return `
                <div class="post-card ${pinned ? 'pinned' : ''}" onclick="viewPost(${issue.number})">
                    <div class="post-title">${esc(issue.title)}</div>
                    <div class="post-meta">
                        <div>
                            <span class="post-category">${esc(cat)}</span>
                            <span style="margin-left:8px">${esc(meta.author || '匿名')}</span>
                        </div>
                        <div class="post-stats">
                            <span>👍 ${issue.reactions ? issue.reactions['+1'] : 0}</span>
                            <span>${timeAgo(issue.created_at)}</span>
                        </div>
                    </div>
                </div>`;
        }).filter(Boolean).join('');
        if (!list.innerHTML.trim()) {
            list.innerHTML = '<div class="empty-state">当前分类暂无帖子</div>';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('postList').innerHTML = '<div class="empty-state">⚠️ 加载失败，请刷新重试</div>';
    }
}

function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadPosts();
}

async function viewPost(number) {
    currentPostId = number;
    try {
        const issue = await gh('GET', `/repos/${REPO}/issues/${number}`);
        const comments = await gh('GET', `/repos/${REPO}/issues/${number}/comments?per_page=100`);
        const meta = parseMeta(issue.body);
        const pinned = issue.labels.some(l => l.name === '置顶');

        document.getElementById('page-home').style.display = 'none';
        document.getElementById('page-post').style.display = 'block';

        let adminBtns = '';
        if (currentUser && currentUser.isAdmin) {
            adminBtns = `
                <button class="btn btn-small btn-success" onclick="togglePin(${issue.number})">${pinned ? '取消置顶' : '置顶'}</button>
                <button class="btn btn-small btn-danger" onclick="deletePost(${issue.number})">删除</button>
            `;
        }

        document.getElementById('postDetail').innerHTML = `
            <div class="title">${pinned ? '📌 ' : ''}${esc(issue.title)}</div>
            <div class="meta">
                <span>👤 ${esc(meta.author || '匿名')}</span>
                <span class="post-category">${esc(meta.category || '灌水闲聊')}</span>
                <span>🕐 ${timeAgo(issue.created_at)}</span>
            </div>
            <div class="content">${esc(meta.content || '')}</div>
            <div class="post-actions">
                <button class="like-btn" onclick="likePost(${issue.number})">👍 ${issue.reactions ? issue.reactions['+1'] : 0}</button>
                ${adminBtns}
            </div>
            <div class="comments-section">
                <div class="comments-title">评论 (${comments.length})</div>
                ${comments.length === 0 ? '<div style="color:#555;font-size:13px">暂无评论</div>' :
                    comments.map(c => {
                        const cm = parseMeta(c.body);
                        return `
                            <div class="comment-item">
                                <div class="comment-header">
                                    <span class="comment-author">${esc(cm.author || '匿名')}</span>
                                    <span class="comment-time">${timeAgo(c.created_at)}</span>
                                </div>
                                <div class="comment-content">${esc(cm.content || c.body)}</div>
                            </div>`;
                    }).join('')}
            </div>
        `;

        document.getElementById('commentArea').style.display = currentUser && currentUser.isApproved ? 'block' : 'none';
        window.scrollTo(0, 0);
    } catch (e) {
        console.error(e);
        alert('加载失败，请重试');
    }
}

function goHome() {
    document.getElementById('page-home').style.display = 'block';
    document.getElementById('page-post').style.display = 'none';
    document.getElementById('page-admin').style.display = 'none';
    currentPostId = null;
    loadPosts();
}

async function likePost(number) {
    try {
        await gh('POST', `/repos/${REPO}/issues/${number}/reactions`, { content: '+1' });
        viewPost(number);
    } catch (e) {
        alert('操作失败');
    }
}

async function submitPost() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录已审核的账号');
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const category = document.getElementById('postCategory').value;
    if (!title || !content) { document.getElementById('postError').textContent = '请填写标题和内容'; return; }

    const body = JSON.stringify({ type: 'post', content, author: currentUser.nickname, category, timestamp: Date.now() });
    try {
        await gh('POST', `/repos/${REPO}/issues`, { title, body, labels: ['帖子', category] });
        closeModal('newPostModal');
        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        document.getElementById('postError').textContent = '';
        loadPosts();
    } catch (e) {
        document.getElementById('postError').textContent = '发布失败：' + e.message;
    }
}

async function submitComment() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录');
    const content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');

    const body = JSON.stringify({ type: 'comment', author: currentUser.nickname, content, timestamp: Date.now() });
    try {
        await gh('POST', `/repos/${REPO}/issues/${currentPostId}/comments`, { body });
        document.getElementById('commentInput').value = '';
        viewPost(currentPostId);
    } catch (e) {
        alert('评论失败');
    }
}

// ========== 注册 ==========
async function doRegister() {
    const nickname = document.getElementById('regNickname').value.trim();
    const reason = document.getElementById('regReason').value.trim();
    if (!nickname || nickname.length < 2) {
        document.getElementById('regError').textContent = '昵称至少2个字';
        return;
    }
    if (!reason) {
        document.getElementById('regError').textContent = '请填写申请理由';
        return;
    }

    const body = JSON.stringify({ type: 'register', nickname, reason, timestamp: Date.now() });
    try {
        await gh('POST', `/repos/${REPO}/issues`, {
            title: `[申请注册] ${nickname}`,
            body,
            labels: ['注册申请']
        });
        closeModal('registerModal');
        alert('申请已提交！请等待管理员审核。');
    } catch (e) {
        document.getElementById('regError').textContent = '提交失败：' + e.message;
    }
}

// ========== 登录 ==========
async function doLogin() {
    const nickname = document.getElementById('loginUser').value.trim();
    if (!nickname) {
        document.getElementById('loginError').textContent = '请输入昵称';
        return;
    }

    // 管理员直接登录
    if (nickname === ADMIN_NICK) {
        currentUser = { nickname: ADMIN_NICK, isAdmin: true, isApproved: true };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('loginModal');
        return;
    }

    try {
        // 查找该用户的注册申请，检查是否已批准
        const issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=已批准&per_page=100`);
        const found = issues.find(i => {
            const meta = parseMeta(i.body);
            return meta.nickname === nickname;
        });

        if (!found) {
            document.getElementById('loginError').textContent = '未找到已批准的账号，请先注册或等待审核';
            return;
        }

        currentUser = { nickname, isAdmin: false, isApproved: true };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginError').textContent = '';
    } catch (e) {
        document.getElementById('loginError').textContent = '登录失败，请重试';
    }
}

// ========== 退出 ==========
function logout() {
    currentUser = null;
    localStorage.removeItem('wuqi_user');
    updateAuthUI();
    if (currentPostId) goHome();
}

// ========== 管理员操作 ==========
async function togglePin(number) {
    try {
        const issue = await gh('GET', `/repos/${REPO}/issues/${number}`);
        const pinned = issue.labels.some(l => l.name === '置顶');
        const labels = issue.labels.map(l => l.name).filter(n => n !== '置顶');
        if (!pinned) labels.push('置顶');
        await gh('PATCH', `/repos/${REPO}/issues/${number}`, { labels });
        viewPost(number);
    } catch (e) { alert('操作失败'); }
}

async function deletePost(number) {
    if (!confirm('确定删除这篇帖子？')) return;
    try {
        await gh('PATCH', `/repos/${REPO}/issues/${number}`, { state: 'closed' });
        goHome();
    } catch (e) { alert('删除失败'); }
}

// ========== 弹窗 ==========
function showLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function showRegister() { document.getElementById('registerModal').style.display = 'flex'; }
function showNewPost() {
    if (!currentUser || !currentUser.isApproved) return showLogin();
    document.getElementById('newPostModal').style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ========== 工具函数 ==========
function parseMeta(body) {
    if (!body) return {};
    try { return JSON.parse(body); } catch (e) { return { content: body }; }
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

init();
