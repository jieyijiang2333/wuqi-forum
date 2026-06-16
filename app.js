// ========== Supabase 配置 ==========
const SUPABASE_URL = 'https://pmywsdyewpeyvwdacmgt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBteXdzZHlld3BleXd2ZGFjbWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTM4NDYsImV4cCI6MjA5NzE2OTg0Nn0.OmZ0O9NPNKlbixFvl-RTh7sV3E1MMwkY4KjKR3zdGq0';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== 状态 ==========
let currentUser = null;
let isAdmin = false;
let currentCategory = '全部';
let currentPostId = null;

// ========== 初始化 ==========
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await checkAdmin();
        updateAuthUI();
    }
    loadPosts();
}

// 监听登录状态变化
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await checkAdmin();
        updateAuthUI();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        isAdmin = false;
        updateAuthUI();
    }
});

// 检查是否是管理员
async function checkAdmin() {
    if (!currentUser) { isAdmin = false; return; }
    const { data } = await supabase.from('admins').select('user_id').eq('user_id', currentUser.id).single();
    isAdmin = !!data;
}

// ========== UI更新 ==========
function updateAuthUI() {
    const nickname = currentUser?.user_metadata?.nickname || currentUser?.email?.split('@')[0] || '';
    if (currentUser) {
        document.getElementById('authArea').style.display = 'none';
        document.getElementById('userArea').style.display = 'flex';
        document.getElementById('currentUser').textContent = nickname;
        document.getElementById('newPostArea').style.display = 'block';
    } else {
        document.getElementById('authArea').style.display = 'flex';
        document.getElementById('userArea').style.display = 'none';
        document.getElementById('newPostArea').style.display = 'none';
    }
}

// ========== 帖子操作 ==========
async function loadPosts() {
    let query = supabase.from('posts').select('*');
    if (currentCategory !== '全部') {
        query = query.eq('category', currentCategory);
    }
    const { data: posts, error } = await query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    const list = document.getElementById('postList');
    if (error || !posts || posts.length === 0) {
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
    const { data: post, error } = await supabase.from('posts').select('*').eq('id', id).single();
    if (error || !post) { alert('帖子不存在'); return; }

    const { data: comments } = await supabase.from('comments').select('*').eq('post_id', id).order('created_at', { ascending: true });

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
}

function goHome() {
    document.getElementById('page-home').style.display = 'block';
    document.getElementById('page-post').style.display = 'none';
    currentPostId = null;
    loadPosts();
}

async function likePost(id) {
    const { data: post } = await supabase.from('posts').select('likes').eq('id', id).single();
    if (post) {
        await supabase.from('posts').update({ likes: post.likes + 1 }).eq('id', id);
        viewPost(id);
    }
}

async function togglePin(id) {
    const { data: post } = await supabase.from('posts').select('is_pinned').eq('id', id).single();
    if (post) {
        await supabase.from('posts').update({ is_pinned: !post.is_pinned }).eq('id', id);
        viewPost(id);
    }
}

async function deletePost(id) {
    if (!confirm('确定删除这篇帖子？')) return;
    await supabase.from('comments').delete().eq('post_id', id);
    await supabase.from('posts').delete().eq('id', id);
    goHome();
}

async function submitComment() {
    const content = document.getElementById('commentInput').value.trim();
    if (!content) return alert('评论不能为空');
    const nickname = currentUser?.user_metadata?.nickname || currentUser?.email?.split('@')[0] || '匿名';
    const { error } = await supabase.from('comments').insert({
        post_id: currentPostId,
        author_name: nickname,
        author_id: currentUser.id,
        content: content
    });
    if (error) { alert('评论失败：' + error.message); return; }
    document.getElementById('commentInput').value = '';
    viewPost(currentPostId);
}

async function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const category = document.getElementById('postCategory').value;
    if (!title || !content) { document.getElementById('postError').textContent = '请填写标题和内容'; return; }
    const nickname = currentUser?.user_metadata?.nickname || currentUser?.email?.split('@')[0] || '匿名';
    const { error } = await supabase.from('posts').insert({
        title, content, category,
        author_name: nickname,
        author_id: currentUser.id
    });
    if (error) { document.getElementById('postError').textContent = '发布失败：' + error.message; return; }
    closeModal('newPostModal');
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postError').textContent = '';
    loadPosts();
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
    // 用随机邮箱注册（如果用户不想暴露邮箱）
    const fakeEmail = `${nickname}@wuqi-forum.local`;
    const { data, error } = await supabase.auth.signUp({
        email: fakeEmail,
        password: password,
        options: { data: { nickname: nickname } }
    });
    if (error) {
        document.getElementById('regError').textContent = error.message;
        return;
    }
    // Supabase 可能需要邮箱验证，如果自动登录成功
    if (data.user) {
        closeModal('registerModal');
        document.getElementById('regError').textContent = '';
        alert('注册成功！');
    } else {
        document.getElementById('regError').textContent = '注册成功，请登录';
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
    const fakeEmail = `${username}@wuqi-forum.local`;
    const { data, error } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: password
    });
    if (error) {
        document.getElementById('loginError').textContent = '登录失败，请检查用户名和密码';
        return;
    }
    currentUser = data.user;
    await checkAdmin();
    updateAuthUI();
    closeModal('loginModal');
    document.getElementById('loginError').textContent = '';
    if (currentPostId) viewPost(currentPostId);
}

// ========== 退出 ==========
async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    isAdmin = false;
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