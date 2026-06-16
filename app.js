// ========== 配置 ==========
const REPO = 'jieyijiang2333/wuqi-forum';
const WORKER = 'https://muddy-darkness-acbc.yokinok.workers.dev';
const ADMIN_NICK = 'jieyijiang2333';

// ========== API 封装（通过 Worker 代理）==========
async function gh(method, path, body) {
    const opts = { method, headers: {} };
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

// ========== 初始化 ==========
function init() {
    const saved = localStorage.getItem('wuqi_user');
    if (saved) {
        try { currentUser = JSON.parse(saved); } catch (e) { currentUser = null; }
    }
    updateAuthUI();
    loadPosts();
}

// ========== UI ==========
function updateAuthUI() {
    if (currentUser) {
        document.getElementById('authArea').style.display = 'none';
        document.getElementById('userArea').style.display = 'flex';
        document.getElementById('currentUser').textContent = currentUser.nickname + (currentUser.isAdmin ? ' 👑' : '');
        document.getElementById('newPostArea').style.display = 'block';
        // 管理员按钮
        let adminBtn = document.getElementById('adminEntryBtn');
        if (currentUser.isAdmin && !adminBtn) {
            adminBtn = document.createElement('button');
            adminBtn.id = 'adminEntryBtn';
            adminBtn.textContent = '📋 管理面板';
            adminBtn.onclick = function() { showAdminPanel(); };
            document.getElementById('adminBtnArea').appendChild(adminBtn);
        }
    } else {
        document.getElementById('authArea').style.display = 'flex';
        document.getElementById('userArea').style.display = 'none';
        document.getElementById('newPostArea').style.display = 'none';
        const ab = document.getElementById('adminEntryBtn');
        if (ab) ab.remove();
    }
}

// ========== 帖子 ==========
async function loadPosts() {
    try {
        const issues = await gh('GET', '/repos/' + REPO + '/issues?state=open&labels=帖子&per_page=100&sort=created&direction=desc');
        const list = document.getElementById('postList');
        if (!issues || issues.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无帖子，快来发表第一篇吧！</div>';
            return;
        }
        issues.sort(function(a, b) {
            var aPin = a.labels.some(function(l) { return l.name === '置顶'; }) ? 1 : 0;
            var bPin = b.labels.some(function(l) { return l.name === '置顶'; }) ? 1 : 0;
            if (bPin !== aPin) return bPin - aPin;
            return new Date(b.created_at) - new Date(a.created_at);
        });
        list.innerHTML = issues.map(function(issue) {
            var meta = parseMeta(issue.body);
            var pinned = issue.labels.some(function(l) { return l.name === '置顶'; });
            var cat = meta.category || '灌水闲聊';
            if (currentCategory !== '全部' && cat !== currentCategory) return '';
            return '<div class="post-card ' + (pinned ? 'pinned' : '') + '" onclick="viewPost(' + issue.number + ')">' +
                '<div class="post-title">' + (pinned ? '📌 ' : '') + esc(issue.title) + '</div>' +
                '<div class="post-meta">' +
                '<div><span class="post-category">' + esc(cat) + '</span><span style="margin-left:8px">' + esc(meta.author || '匿名') + '</span></div>' +
                '<div class="post-stats"><span>👍 ' + (issue.reactions ? (issue.reactions['+1'] || 0) : 0) + '</span><span>' + timeAgo(issue.created_at) + '</span></div>' +
                '</div></div>';
        }).filter(Boolean).join('');
        if (!list.innerHTML.trim()) list.innerHTML = '<div class="empty-state">当前分类暂无帖子</div>';
    } catch (e) {
        console.error('loadPosts error:', e);
        document.getElementById('postList').innerHTML = '<div class="empty-state">⚠️ 加载失败，请刷新重试</div>';
    }
}

function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadPosts();
}

async function viewPost(number) {
    currentPostId = number;
    try {
        var issue = await gh('GET', '/repos/' + REPO + '/issues/' + number);
        var comments = await gh('GET', '/repos/' + REPO + '/issues/' + number + '/comments?per_page=100');
        var meta = parseMeta(issue.body);
        var pinned = issue.labels.some(function(l) { return l.name === '置顶'; });

        document.getElementById('page-home').style.display = 'none';
        document.getElementById('page-post').style.display = 'block';

        var adminBtns = '';
        if (currentUser && currentUser.isAdmin) {
            adminBtns = '<button class="btn btn-small btn-success" onclick="togglePin(' + issue.number + ')">' + (pinned ? '取消置顶' : '置顶') + '</button>' +
                '<button class="btn btn-small btn-danger" onclick="deletePost(' + issue.number + ')">删除</button>';
        }

        document.getElementById('postDetail').innerHTML =
            '<div class="title">' + esc(issue.title) + '</div>' +
            '<div class="meta">' +
            '<span>👤 ' + esc(meta.author || '匿名') + '</span>' +
            '<span class="post-category">' + esc(meta.category || '灌水闲聊') + '</span>' +
            '<span>🕐 ' + timeAgo(issue.created_at) + '</span>' +
            '</div>' +
            '<div class="content">' + esc(meta.content || '') + '</div>' +
            '<div class="post-actions">' +
            '<button class="like-btn" onclick="likePost(' + issue.number + ')">👍 ' + (issue.reactions ? (issue.reactions['+1'] || 0) : 0) + '</button>' +
            adminBtns +
            '</div>' +
            '<div class="comments-section">' +
            '<div class="comments-title">评论 (' + (comments ? comments.length : 0) + ')</div>' +
            (!comments || comments.length === 0 ? '<div style="color:#555;font-size:13px">暂无评论</div>' :
                comments.map(function(c) {
                    var cm = parseMeta(c.body);
                    return '<div class="comment-item"><div class="comment-header"><span class="comment-author">' + esc(cm.author || '匿名') + '</span><span class="comment-time">' + timeAgo(c.created_at) + '</span></div><div class="comment-content">' + esc(cm.content || c.body) + '</div></div>';
                }).join('')) +
            '</div>';

        document.getElementById('commentArea').style.display = (currentUser && currentUser.isApproved) ? 'block' : 'none';
        window.scrollTo(0, 0);
    } catch (e) {
        console.error('viewPost error:', e);
        alert('加载失败：' + e.message);
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
        await gh('POST', '/repos/' + REPO + '/issues/' + number + '/reactions', { content: '+1' });
        viewPost(number);
    } catch (e) { alert('操作失败'); }
}

async function submitPost() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录');
    var title = document.getElementById('postTitle').value.trim();
    var content = document.getElementById('postContent').value.trim();
    var category = document.getElementById('postCategory').value;
    if (!title || !content) { document.getElementById('postError').textContent = '请填写标题和内容'; return; }
    var body = JSON.stringify({ type: 'post', content: content, author: currentUser.nickname, category: category, timestamp: Date.now() });
    try {
        await gh('POST', '/repos/' + REPO + '/issues', { title: title, body: body, labels: ['帖子', category] });
        closeModal('newPostModal');
        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        document.getElementById('postError').textContent = '';
        loadPosts();
    } catch (e) { document.getElementById('postError').textContent = '发布失败：' + e.message; }
}

async function submitComment() {
    if (!currentUser || !currentUser.isApproved) return alert('请先登录');
    var content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');
    var body = JSON.stringify({ type: 'comment', author: currentUser.nickname, content: content, timestamp: Date.now() });
    try {
        await gh('POST', '/repos/' + REPO + '/issues/' + currentPostId + '/comments', { body: body });
        document.getElementById('commentInput').value = '';
        viewPost(currentPostId);
    } catch (e) { alert('评论失败'); }
}

// ========== 注册 ==========
async function doRegister() {
    var nickname = document.getElementById('regNickname').value.trim();
    var password = document.getElementById('regPassword').value;
    var reason = document.getElementById('regReason').value.trim();
    if (!nickname || nickname.length < 2) { document.getElementById('regError').textContent = '昵称至少2个字'; return; }
    if (!password || password.length < 4) { document.getElementById('regError').textContent = '密码至少4位'; return; }
    if (!reason) { document.getElementById('regError').textContent = '请填写申请理由'; return; }
    document.getElementById('regError').textContent = '正在提交...';
    var passwordHash = await hashPassword(password);
    var body = JSON.stringify({ type: 'register', nickname: nickname, passwordHash: passwordHash, reason: reason, timestamp: Date.now() });
    try {
        await gh('POST', '/repos/' + REPO + '/issues', { title: '[申请注册] ' + nickname, body: body, labels: ['注册申请'] });
        closeModal('registerModal');
        alert('注册申请已提交！等待管理员审核。');
        document.getElementById('regError').textContent = '';
    } catch (e) { document.getElementById('regError').textContent = '提交失败：' + e.message; }
}

// ========== 登录 ==========
async function doLogin() {
    var nickname = document.getElementById('loginUser').value.trim();
    var password = document.getElementById('loginPass').value;
    if (!nickname) { document.getElementById('loginError').textContent = '请输入昵称'; return; }
    if (!password) { document.getElementById('loginError').textContent = '请输入密码'; return; }

    // 管理员登录
    if (nickname === ADMIN_NICK) {
        var adminHash = await hashPassword(password);
        var storedHash = localStorage.getItem('wuqi_admin_pwd');
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

    // 普通用户登录
    try {
        var issues = await gh('GET', '/repos/' + REPO + '/issues?state=open&labels=已批准&per_page=100');
        var found = null;
        for (var i = 0; i < issues.length; i++) {
            var m = parseMeta(issues[i].body);
            if (m.nickname === nickname) { found = issues[i]; break; }
        }
        if (!found) { document.getElementById('loginError').textContent = '未找到已批准的账号，请先注册'; return; }
        var meta = parseMeta(found.body);
        var inputHash = await hashPassword(password);
        if (meta.passwordHash !== inputHash) {
            document.getElementById('loginError').textContent = '密码错误';
            return;
        }
        currentUser = { nickname: nickname, isAdmin: false, isApproved: true, issueNumber: found.number };
        localStorage.setItem('wuqi_user', JSON.stringify(currentUser));
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginError').textContent = '';
    } catch (e) {
        document.getElementById('loginError').textContent = '登录失败，请重试';
    }
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
    var password = document.getElementById('deletePass').value;
    if (!password) { document.getElementById('deleteError').textContent = '请输入密码确认'; return; }
    try {
        var issues = await gh('GET', '/repos/' + REPO + '/issues?state=open&labels=已批准&per_page=100');
        var found = null;
        for (var i = 0; i < issues.length; i++) {
            if (parseMeta(issues[i].body).nickname === currentUser.nickname) { found = issues[i]; break; }
        }
        if (!found) { document.getElementById('deleteError').textContent = '账号未找到'; return; }
        var meta = parseMeta(found.body);
        var inputHash = await hashPassword(password);
        if (meta.passwordHash !== inputHash) {
            document.getElementById('deleteError').textContent = '密码错误';
            return;
        }
        var body = JSON.stringify({ type: 'delete_request', nickname: currentUser.nickname, userIssue: found.number, timestamp: Date.now() });
        await gh('POST', '/repos/' + REPO + '/issues', { title: '[注销申请] ' + currentUser.nickname, body: body, labels: ['注销申请'] });
        closeModal('deleteModal');
        alert('注销申请已提交，等待管理员审核。');
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
        var regIssues = await gh('GET', '/repos/' + REPO + '/issues?state=open&labels=注册申请&per_page=50&sort=created&direction=desc');
        var html = '';

        // 注册审核
        html += '<div style="color:#ffd700;font-size:16px;font-weight:600;margin:16px 0 12px;">📋 注册审核</div>';
        if (!regIssues || regIssues.length === 0) {
            html += '<div class="empty-state" style="padding:20px;">暂无注册申请</div>';
        } else {
            for (var i = 0; i < regIssues.length; i++) {
                var issue = regIssues[i];
                var meta = parseMeta(issue.body);
                html += '<div class="post-card" style="border-left:3px solid #ff9800;">' +
                    '<div class="post-title">' + esc(issue.title) + '</div>' +
                    '<div style="margin-top:8px;font-size:13px;color:#bbb;">' +
                    '<div>昵称：<b style="color:#fff">' + esc(meta.nickname || '未知') + '</b></div>' +
                    '<div>理由：' + esc(meta.reason || '无') + '</div>' +
                    '<div>申请时间：' + timeAgo(issue.created_at) + '</div>' +
                    '</div>' +
                    '<div style="margin-top:12px;display:flex;gap:8px;">' +
                    '<button class="btn btn-small btn-success" onclick="doApproveUser(' + issue.number + ',\'' + esc(meta.nickname || '') + '\')">✅ 批准</button>' +
                    '<button class="btn btn-small btn-danger" onclick="doRejectUser(' + issue.number + ')">❌ 拒绝</button>' +
                    '</div></div>';
            }
        }

        document.getElementById('adminContent').innerHTML = html;
    } catch (e) {
        console.error('showAdminPanel error:', e);
        document.getElementById('adminContent').innerHTML = '<div class="empty-state">⚠️ 加载失败：' + esc(e.message) + '</div>';
    }
}

async function doApproveUser(issueNumber, nickname) {
    try {
        var issue = await gh('GET', '/repos/' + REPO + '/issues/' + issueNumber);
        var labels = issue.labels.map(function(l) { return l.name; }).filter(function(n) { return n !== '注册申请'; });
        labels.push('已批准');
        await gh('PATCH', '/repos/' + REPO + '/issues/' + issueNumber, { labels: labels });
        alert('已批准「' + nickname + '」');
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

async function doRejectUser(issueNumber) {
    if (!confirm('确定拒绝该注册申请？')) return;
    try {
        await gh('PATCH', '/repos/' + REPO + '/issues/' + issueNumber, { state: 'closed' });
        alert('已拒绝');
        showAdminPanel();
    } catch (e) { alert('操作失败：' + e.message); }
}

// ========== 管理员帖子操作 ==========
async function togglePin(number) {
    try {
        var issue = await gh('GET', '/repos/' + REPO + '/issues/' + number);
        var pinned = issue.labels.some(function(l) { return l.name === '置顶'; });
        var labels = issue.labels.map(function(l) { return l.name; }).filter(function(n) { return n !== '置顶'; });
        if (!pinned) labels.push('置顶');
        await gh('PATCH', '/repos/' + REPO + '/issues/' + number, { labels: labels });
        viewPost(number);
    } catch (e) { alert('操作失败'); }
}

async function deletePost(number) {
    if (!confirm('确定删除这篇帖子？')) return;
    try { await gh('PATCH', '/repos/' + REPO + '/issues/' + number, { state: 'closed' }); goHome(); } catch (e) { alert('删除失败'); }
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
function parseMeta(body) { if (!body) return {}; try { return JSON.parse(body); } catch (e) { return { content: body }; } }
function esc(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function timeAgo(dateStr) {
    if (!dateStr) return '';
    var diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
}

init();
