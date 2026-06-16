// ========== 配置 ==========
const REPO = 'jieyijiang2333/wuqi-forum';
const WORKER = 'https://muddy-darkness-acbc.yokinok.workers.dev';
const ADMIN_NICK = 'jieyijiang2333';
const MUTED_ISSUE_TITLE = '[系统] 禁言名单';
const DELETE_ISSUE_LABEL = '注销申请';

// ========== API 封装 ==========
async function gh(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(WORKER + path, opts);
    if (res.status === 204) return null;
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { throw new Error(text || '请求失败'); }
}

// ========== 密码哈希 ==========
async function hashPassword(pwd) {
    const enc = new TextEncoder().encode(pwd + 'wuqi_salt_2026');
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 状态 ==========
let currentUser = null;
let currentCategory = '全部';
let currentPostId = null;
let mutedUsers = JSON.parse(localStorage.getItem('wuqi_muted') || '[]');

// ========== 初始化 ==========
function init() {
    const saved = localStorage.getItem('wuqi_user');
    if (saved) { currentUser = JSON.parse(saved); updateAuthUI(); }
    loadMutedList();
    loadPosts();
}

// ========== 禁言名单同步 ==========
async function loadMutedList() {
    try {
        const issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=系统数据&per_page=10`);
        const mutedIssue = issues.find(i => i.title === MUTED_ISSUE_TITLE);
        if (mutedIssue) {
            const meta = parseMeta(mutedIssue.body);
            mutedUsers = meta.muted || [];
            localStorage.setItem('wuqi_muted', JSON.stringify(mutedUsers));
        }
    } catch (e) { console.log('加载禁言名单失败'); }
}

async function saveMutedList() {
    try {
        const issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=系统数据&per_page=10`);
        const mutedIssue = issues.find(i => i.title === MUTED_ISSUE_TITLE);
        const body = JSON.stringify({ type: 'muted_list', muted: mutedUsers, timestamp: Date.now() });
        if (mutedIssue) {
            await gh('PATCH', `/repos/${REPO}/issues/${mutedIssue.number}`, { body });
        } else {
            await gh('POST', `/repos/${REPO}/issues`, { title: MUTED_ISSUE_TITLE, body, labels: ['系统数据'] });
        }
    } catch (e) { alert('保存禁言名单失败'); }
}

function isMuted(nickname) {
    return mutedUsers.includes(nickname);
}

// ========== UI ==========
function updateAuthUI() {
    const authArea = document.getElementById('authArea');
    const userArea = document.getElementById('userArea');
    const newPostArea = document.getElementById('newPostArea');
    if (currentUser) {
        authArea.style.display = 'none';
        userArea.style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser.nickname + (currentUser.isAdmin ? ' 👑' : '');
        newPostArea.style.display = 'block';
        let adminBtn = document.getElementById('adminEntryBtn');
        if (currentUser.isAdmin && !adminBtn) {
            adminBtn = document.createElement('button');
            adminBtn.id = 'adminEntryBtn';
            adminBtn.className = 'btn';
            adminBtn.style.cssText = 'background:#4CAF50;color:#fff;border:none;padding:10px;border-radius:8px;margin-top:10px;width:100%;font-size:14px;cursor:pointer;font-weight:600;';
            adminBtn.textContent = '📋 管理面板';
            adminBtn.onclick = showAdminPanel;
            newPostArea.parentElement.insertBefore(adminBtn, newPostArea);
        }
    } else {
        authArea.style.display = 'flex';
        userArea.style.display = 'none';
        newPostArea.style.display = 'none';
        const ab = document.getElementById('adminEntryBtn');
        if (ab) ab.remove();
    }
}

// ========== 帖子操作 ==========
async function loadPosts() {
    try {
        let issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=帖子&per_page=100&sort=created&direction=desc`);
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
            return `<div class="post-card ${pinned ? 'pinned' : ''}" onclick="viewPost(${issue.number})">
                <div class="post-title">${pinned ? '📌 ' : ''}${esc(issue.title)}</div>
                <div class="post-meta">
                    <div><span class="post-category">${esc(cat)}</span><span style="margin-left:8px">${esc(meta.author || '匿名')}${isMuted(meta.author) ? ' 🚫' : ''}</span></div>
                    <div class="post-stats"><span>👍 ${issue.reactions ? (issue.reactions['+1'] || 0) : 0}</span><span>${timeAgo(issue.created_at)}</span></div>
                </div>
            </div>`;
        }).filter(Boolean).join('');
        if (!list.innerHTML.trim()) list.innerHTML = '<div class="empty-state">当前分类暂无帖子</div>';
    } catch (e) {
        console.error(e);
        document.getElementById('postList').innerHTML = '<div class="empty-state">⚠️ 加载失败</div>';
    }
}

function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.cat === cat));
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
            adminBtns = `<button class="btn btn-small btn-success" onclick="togglePin(${issue.number})">${pinned ? '取消置顶' : '置顶'}</button>
                <button class="btn btn-small btn-danger" onclick="deletePost(${issue.number})">删除</button>`;
        }
        document.getElementById('postDetail').innerHTML = `
            <div class="title">${esc(issue.title)}</div>
            <div class="meta">
                <span>👤 ${esc(meta.author || '匿名')}</span>
                <span class="post-category">${esc(meta.category || '灌水闲聊')}</span>
                <span>🕐 ${timeAgo(issue.created_at)}</span>
            </div>
            <div class="content">${esc(meta.content || '')}</div>
            <div class="post-actions">
                <button class="like-btn" onclick="likePost(${issue.number})">👍 ${issue.reactions ? (issue.reactions['+1'] || 0) : 0}</button>
                ${adminBtns}
            </div>
            <div class="comments-section">
                <div class="comments-title">评论 (${comments.length})</div>
                ${comments.length === 0 ? '<div style="color:#555;font-size:13px">暂无评论</div>' :
                    comments.map(c => { const cm = parseMeta(c.body); return `<div class="comment-item"><div class="comment-header"><span class="comment-author">${esc(cm.author || '匿名')}</span><span class="comment-time">${timeAgo(c.created_at)}</span></div><div class="comment-content">${esc(cm.content || c.body)}</div></div>`; }).join('')}
            </div>`;
        document.getElementById('commentArea').style.display = currentUser && currentUser.isApproved && !isMuted(currentUser.nickname) ? 'block' : 'none';
        window.scrollTo(0, 0);
    } catch (e) { console.error(e); alert('加载失败'); }
}

function goHome() {
    document.getElementById('page-home').style.display = 'block';
    document.getElementById('page-post').style.display = 'none';
    document.getElementById('page-admin').style.display = 'none';
    currentPostId = null;
    loadPosts();
}

async function likePost(number) {
    try { await gh('POST', `/repos/${REPO}/issues/${number}/reactions`, { content: '+1' }); viewPost(number); } catch (e) { alert('操作失败'); }
}

async function submitPost() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录');
    if (isMuted(currentUser.nickname)) return alert('你已被禁言，无法发帖');
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
    } catch (e) { document.getElementById('postError').textContent = '发布失败：' + e.message; }
}

async function submitComment() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录');
    if (isMuted(currentUser.nickname)) return alert('你已被禁言，无法评论');
    const content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');
    const body = JSON.stringify({ type: 'comment', author: currentUser.nickname, content, timestamp: Date.now() });
    try { await gh('POST', `/repos/${REPO}/issues/${currentPostId}/comments`, { body }); document.getElementById('commentInput').value = ''; viewPost(currentPostId); } catch (e) { alert('评论失败'); }
}

// ========== 注册 ==========
async function doRegister() {
    const nickname = document.getElementById('regNickname').value.trim();
    const password = document.getElementById('regPassword').value;
    const reason = document.getElementById('regReason').value.trim();
    if (!nickname || nickname.length < 2) { document.getElementById('regError').textContent = '昵称至少2个字'; return; }
    if (!password || password.length < 4) { document.getElementById('regError').textContent = '密码至少4位'; return; }
    if (!reason) { document.getElementById('regError').textContent = '请填写申请理由'; return; }
    document.getElementById('regError').textContent = '正在提交...';
    const passwordHash = await hashPassword(password);
    const body = JSON.stringify({ type: 'register', nickname, passwordHash, reason, timestamp: Date.now() });
    try {
        await gh('POST', `/repos/${REPO}/issues`, { title: `[申请注册] ${nickname}`, body, labels: ['注册申请'] });
        closeModal('registerModal');
        alert('注册申请已提交！等待管理员审核。');
        document.getElementById('regError').textContent = '';
    } catch (e) { document.getElementById('regError').textContent = '提交失败：' + e.message; }
}

// ========== 登录 ==========
async function doLogin() {
    const nickname = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    if (!nickname) { document.getElementById('loginError').textContent = '请输入昵称'; return; }
    if (!password) { document.getElementById('loginError').textContent = '请输入密码'; return; }

    if (nickname === ADMIN_NICK) {
        const adminHash = await hashPassword(password);
        const storedHash = localStorage.getItem('wuqi_admin_pwd');
        if (storedHash && storedHash !== adminHash) {
            document.getElementById('loginError').textContent = '管理员密码错误';
            return;
        }
        if (!storedHash) localStorage.setItem('wuqi_admin_pwd', adminHash);
        currentUser = { nickname: ADMIN_NICK, isAdmin: true, isApproved: true };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginError').textContent = '';
        return;
    }

    if (isMuted(nickname)) {
        document.getElementById('loginError').textContent = '该账号已被禁言';
        return;
    }

    try {
        const issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=已批准&per_page=100`);
        const found = issues.find(i => {
            const meta = parseMeta(i.body);
            return meta.nickname === nickname;
        });
        if (!found) { document.getElementById('loginError').textContent = '未找到已批准的账号，请先注册'; return; }
        const meta = parseMeta(found.body);
        const inputHash = await hashPassword(password);
        if (meta.passwordHash !== inputHash) {
            document.getElementById('loginError').textContent = '密码错误';
            return;
        }
        currentUser = { nickname, isAdmin: false, isApproved: true, issueNumber: found.number };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginError').textContent = '';
    } catch (e) { document.getElementById('loginError').textContent = '登录失败，请重试'; }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('wuqi_user');
    updateAuthUI();
    if (currentPostId) goHome();
}

// ========== 注销账号 ==========
function showDeleteAccount() {
    if (!currentUser || currentUser.isAdmin) return alert('管理员账号不能注销');
    document.getElementById('deleteModal').style.display = 'flex';
}

async function doDeleteAccount() {
    if (!currentUser || currentUser.isAdmin) return;
    const password = document.getElementById('deletePass').value;
    if (!password) { document.getElementById('deleteError').textContent = '请输入密码确认'; return; }
    try {
        const issues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=已批准&per_page=100`);
        const found = issues.find(i => parseMeta(i.body).nickname === currentUser.nickname);
        if (!found) { document.getElementById('deleteError').textContent = '账号未找到'; return; }
        const meta = parseMeta(found.body);
        const inputHash = await hashPassword(password);
        if (meta.passwordHash !== inputHash) {
            document.getElementById('deleteError').textContent = '密码错误';
            return;
        }
        const body = JSON.stringify({ type: 'delete_request', nickname: currentUser.nickname, userIssue: found.number, timestamp: Date.now() });
        await gh('POST', `/repos/${REPO}/issues`, { title: `[注销申请] ${currentUser.nickname}`, body, labels: [DELETE_ISSUE_LABEL] });
        closeModal('deleteModal');
        alert('注销申请已提交，等待管理员审核。审核通过后账号将被注销。');
        logout();
    } catch (e) { document.getElementById('deleteError').textContent = '提交失败：' + e.message; }
}

// ========== 管理面板 ==========
async function showAdminPanel() {
    if (!currentUser || !currentUser.isAdmin) return;
    document.getElementById('page-home').style.display = 'none';
    document.getElementById('page-post').style.display = 'none';
    document.getElementById('page-admin').style.display = 'block';
    document.getElementById('adminContent').innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;">加载中...</div>';

    try {
        const [regIssues, delIssues] = await Promise.all([
            gh('GET', `/repos/${REPO}/issues?state=open&labels=注册申请&per_page=50&sort=created&direction=desc`),
            gh('GET', `/repos/${REPO}/issues?state=open&labels=${DELETE_ISSUE_LABEL}&per_page=50`)
        ]);

        let html = '';

        // 注册审核
        html += '<div style="color:#ffd700;font-size:16px;font-weight:600;margin:16px 0 12px;">📋 注册审核</div>';
        if (!regIssues || regIssues.length === 0) {
            html += '<div class="empty-state" style="padding:20px;">暂无注册申请</div>';
        } else {
            regIssues.forEach(issue => {
                const meta = parseMeta(issue.body);
                html += `<div class="post-card" style="border-left:3px solid #ff9800;" data-issue="${issue.number}" data-nickname="${esc(meta.nickname || '')}">
                    <div class="post-title">${esc(issue.title)}</div>
                    <div style="margin-top:8px;font-size:13px;color:#bbb;">
                        <div>昵称：<b style="color:#fff">${esc(meta.nickname || '未知')}</b></div>
                        <div>理由：${esc(meta.reason || '无')}</div>
                        <div>申请时间：${timeAgo(issue.created_at)}</div>
                    </div>
                    <div style="margin-top:12px;display:flex;gap:8px;">
                        <button class="btn btn-small btn-success" onclick="approveUser(this)">✅ 批准</button>
                        <button class="btn btn-small btn-danger" onclick="rejectUser(this)">❌ 拒绝</button>
                    </div>
                </div>`;
            });
        }

        // 注销审核
        html += '<div style="color:#ffd700;font-size:16px;font-weight:600;margin:24px 0 12px;">🗑️ 注销审核</div>';
        if (!delIssues || delIssues.length === 0) {
            html += '<div class="empty-state" style="padding:20px;">暂无注销申请</div>';
        } else {
            delIssues.forEach(issue => {
                const meta = parseMeta(issue.body);
                html += `<div class="post-card" style="border-left:3px solid #e53935;" data-issue="${issue.number}" data-user-issue="${meta.userIssue || ''}">
                    <div class="post-title">${esc(issue.title)}</div>
                    <div style="margin-top:8px;font-size:13px;color:#bbb;">
                        <div>昵称：<b style="color:#fff">${esc(meta.nickname || '未知')}</b></div>
                        <div>申请时间：${timeAgo(issue.created_at)}</div>
                    </div>
                    <div style="margin-top:12px;display:flex;gap:8px;">
                        <button class="btn btn-small btn-success" onclick="approveDelete(this)">✅ 批准注销</button>
                        <button class="btn btn-small btn-danger" onclick="rejectDelete(this)">❌ 拒绝</button>
                    </div>
                </div>`;
            });
        }

        // 禁言管理
        html += '<div style="color:#ffd700;font-size:16px;font-weight:600;margin:24px 0 12px;">🚫 禁言管理</div>';
        html += `<div style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="muteInput" placeholder="输入要禁言的昵称" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,215,0,0.15);background:#13111d;color:#e8e6f0;font-size:14px;outline:none;" />
            <button class="btn btn-small btn-danger" onclick="muteUser()" style="padding:10px 16px;border-radius:8px;font-weight:600;">禁言</button>
        </div>`;
        if (mutedUsers.length === 0) {
            html += '<div class="empty-state" style="padding:20px;">暂无禁言用户</div>';
        } else {
            mutedUsers.forEach(nick => {
                html += `<div class="post-card" style="border-left:3px solid #9c27b0;display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:#e8e6f0;">🚫 ${esc(nick)}</span>
                    <button class="btn btn-small btn-success" onclick="unmuteUser('${esc(nick)}')">解除禁言</button>
                </div>`;
            });
        }

        document.getElementById('adminContent').innerHTML = html;
    } catch (e) {
        console.error(e);
        document.getElementById('adminContent').innerHTML = '<div class="empty-state">⚠️ 加载失败</div>';
    }
}

// 管理员操作：批准注册
async function approveUser(btn) {
    const card = btn.closest('.post-card');
    const issueNumber = parseInt(card.dataset.issue);
    const nickname = card.dataset.nickname;
    try {
        const issue = await gh('GET', `/repos/${REPO}/issues/${issueNumber}`);
        const labels = issue.labels.map(l => l.name).filter(n => n !== '注册申请');
        labels.push('已批准');
        await gh('PATCH', `/repos/${REPO}/issues/${issueNumber}`, { labels });
        alert(`已批准「${nickname}」`);
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

// 管理员操作：拒绝注册
async function rejectUser(btn) {
    const card = btn.closest('.post-card');
    const issueNumber = parseInt(card.dataset.issue);
    if (!confirm('确定拒绝该注册申请？')) return;
    try {
        await gh('PATCH', `/repos/${REPO}/issues/${issueNumber}`, { state: 'closed' });
        alert('已拒绝');
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

// 管理员操作：批准注销
async function approveDelete(btn) {
    const card = btn.closest('.post-card');
    const issueNumber = parseInt(card.dataset.issue);
    const userIssue = parseInt(card.dataset.userIssue);
    if (!confirm('确定批准注销？该用户的注册信息将被关闭。')) return;
    try {
        // 关闭用户注册 Issue
        if (userIssue) {
            await gh('PATCH', `/repos/${REPO}/issues/${userIssue}`, { state: 'closed' });
        }
        // 关闭注销申请 Issue
        await gh('PATCH', `/repos/${REPO}/issues/${issueNumber}`, { state: 'closed' });
        alert('注销已批准');
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

// 管理员操作：拒绝注销
async function rejectDelete(btn) {
    const card = btn.closest('.post-card');
    const issueNumber = parseInt(card.dataset.issue);
    if (!confirm('确定拒绝该注销申请？')) return;
    try {
        await gh('PATCH', `/repos/${REPO}/issues/${issueNumber}`, { state: 'closed' });
        alert('已拒绝');
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

// 管理员操作：禁言
async function muteUser() {
    const input = document.getElementById('muteInput');
    const nickname = input.value.trim();
    if (!nickname) return alert('请输入昵称');
    if (nickname === ADMIN_NICK) return alert('不能禁言管理员');
    if (isMuted(nickname)) return alert('该用户已被禁言');
    mutedUsers.push(nickname);
    await saveMutedList();
    input.value = '';
    alert(`已禁言「${nickname}」`);
    showAdminPanel();
}

// 管理员操作：解除禁言
async function unmuteUser(nickname) {
    if (!confirm(`确定解除「${nickname}」的禁言？`)) return;
    mutedUsers = mutedUsers.filter(n => n !== nickname);
    await saveMutedList();
    alert(`已解除「${nickname}」的禁言`);
    showAdminPanel();
}

// ========== 管理员帖子操作 ==========
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
    try { await gh('PATCH', `/repos/${REPO}/issues/${number}`, { state: 'closed' }); goHome(); } catch (e) { alert('删除失败'); }
}

// ========== 弹窗 ==========
function showLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function showRegister() { document.getElementById('registerModal').style.display = 'flex'; }
function showNewPost() {
    if (!currentUser || !currentUser.isApproved) return showLogin();
    if (isMuted(currentUser.nickname)) return alert('你已被禁言，无法发帖');
    document.getElementById('newPostModal').style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ========== 工具函数 ==========
function parseMeta(body) { if (!body) return {}; try { return JSON.parse(body); } catch (e) { return { content: body }; } }
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

init();
