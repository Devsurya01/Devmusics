/* ══════════════════════════════════════════════
   auth.js — Login, Signup, Google OAuth,
   strong password rules, duplicate prevention,
   works offline (localStorage) + with server
   ══════════════════════════════════════════════ */

const AUTH_API = '/api';
let serverAvailable = false;
let googleReady = false;

/* ── Check if server is running ─────────────── */
async function checkServer() {
  try {
    const r = await fetch(`${AUTH_API}/songs`, { signal: AbortSignal.timeout(1500) });
    serverAvailable = r.ok;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

/* ══════════════════════════════════════════════
   LOCAL STORAGE USER DB (offline fallback)
   ══════════════════════════════════════════════ */
function getLocalUsers() {
  try { return JSON.parse(localStorage.getItem('sw_users_db') || '[]'); }
  catch { return []; }
}
function saveLocalUsers(users) {
  localStorage.setItem('sw_users_db', JSON.stringify(users));
}

function getCachedUserProfile(userId) {
  if (!userId) return {};
  try {
    const cache = JSON.parse(localStorage.getItem('sw_user_profiles') || '{}');
    return cache[userId] || {};
  } catch {
    return {};
  }
}

function cacheUserProfile(user) {
  if (!user?.id || user.isGuest) return;
  try {
    const cache = JSON.parse(localStorage.getItem('sw_user_profiles') || '{}');
    cache[user.id] = {
      ...(cache[user.id] || {}),
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      profileImage: user.profileImage,
      theme: user.theme,
      likedSongs: user.likedSongs,
      playlists: user.playlists,
      createdAt: user.createdAt,
      googleId: user.googleId
    };
    localStorage.setItem('sw_user_profiles', JSON.stringify(cache));
  } catch (err) {
    console.error('User profile cache failed:', err);
  }
}

function mergeCachedUserProfile(user) {
  if (!user?.id) return user;
  const cached = getCachedUserProfile(user.id);
  return {
    ...cached,
    ...user,
    likedSongs: user.likedSongs?.length ? user.likedSongs : (cached.likedSongs || []),
    playlists: user.playlists?.length ? user.playlists : (cached.playlists || []),
    theme: user.theme || cached.theme || 'default'
  };
}

function localRegister({ email, username, password }) {
  const users = getLocalUsers();
  const emailLow = email.toLowerCase().trim();
  const userLow  = username.toLowerCase().trim();
  if (users.find(u => u.email.toLowerCase() === emailLow))
    return { error: 'An account with this email already exists.' };
  if (users.find(u => u.username.toLowerCase() === userLow))
    return { error: 'That username is taken. Please choose another.' };
  const user = {
    id: 'local_' + Date.now(),
    email: emailLow, username: username.trim(),
    password,
    likedSongs: [], playlists: [], theme: 'default',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveLocalUsers(users);
  const { password: _, ...safe } = user;
  cacheUserProfile(safe);
  return { user: safe };
}

function localLogin({ emailOrUsername, password }) {
  const users = getLocalUsers();
  const q = emailOrUsername.toLowerCase().trim();
  const user = users.find(u => u.email.toLowerCase() === q || u.username.toLowerCase() === q);
  if (!user) {
    return { error: 'There is no account on this mail id.' };
  }
  if (user.password !== password) {
    return { error: 'Incorrect password.' };
  }
  const { password: _, ...safe } = user;
  return { user: mergeCachedUserProfile(safe) };
}

/* ── Sync liked songs / playlists back to local DB ── */
function syncUserToLocalDB(user) {
  if (!user || user.id?.startsWith('local_') === false && serverAvailable) return;
  const users = getLocalUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx] = {
      ...users[idx],
      likedSongs: user.likedSongs,
      playlists: user.playlists,
      theme: user.theme,
      avatar: user.avatar,
      profileImage: user.profileImage
    };
    saveLocalUsers(users);
  }
  cacheUserProfile(user);
}

/* ══════════════════════════════════════════════
   PASSWORD STRENGTH
   ══════════════════════════════════════════════ */
const PW_RULES = [
  { re: /.{8,}/,          label: 'At least 8 characters',          id: 'r-len'  },
  { re: /[A-Z]/,          label: 'At least one uppercase letter',   id: 'r-cap'  },
  { re: /[0-9]/,          label: 'At least one number',             id: 'r-num'  },
  { re: /[^A-Za-z0-9]/,  label: 'At least one special character',  id: 'r-sym'  },
];

function injectPasswordRulesCSS() {
  if (document.getElementById('pw-rules-css')) return;
  const s = document.createElement('style');
  s.id = 'pw-rules-css';
  s.textContent = `
    .pw-rules {
      list-style:none;padding:0;margin:4px 0 14px;
      display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;
    }
    .pw-rules li {
      display:flex;align-items:center;gap:5px;
      font-size:12px;color:var(--text2);
      transition:color 0.2s ease;
    }
    .pw-rules li .ri { font-size:11px; transition:color 0.2s ease; }
    .pw-rules li.pass { color:#16a34a; }
    .pw-rules li.pass .ri { color:#16a34a; }
    .pw-rules li.fail { color:#e11d48; }
    .pw-strength-bar {
      height:4px;border-radius:999px;margin-bottom:12px;
      background:var(--border);overflow:hidden;
    }
    .pw-strength-fill {
      height:100%;border-radius:999px;width:0;
      transition:width 0.3s ease,background 0.3s ease;
    }
    .strength-0 { width:0%;   background:transparent; }
    .strength-1 { width:25%;  background:#e11d48; }
    .strength-2 { width:50%;  background:#ea580c; }
    .strength-3 { width:75%;  background:#ca8a04; }
    .strength-4 { width:100%; background:#16a34a; }
    .btn-spinner {
      display:inline-block;width:18px;height:18px;border-radius:50%;
      border:2px solid rgba(255,255,255,0.35);border-top-color:rgba(255,255,255,0.9);
      animation:spin 0.7s linear infinite;vertical-align:middle;
    }
    @keyframes spin { to { transform:rotate(360deg); } }
    .form-group.field-error  { border-color:#e11d48!important;animation:fShake 0.3s ease; }
    .form-group.field-ok     { border-color:#16a34a!important; }
    @keyframes fShake {
      0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)}
    }
    @keyframes fadeSlideIn {
      from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:none}
    }
    .error-msg { animation:fadeSlideIn 0.2s ease; }
    .server-badge {
      display:inline-flex;align-items:center;gap:5px;
      font-size:11px;padding:3px 10px;border-radius:999px;
      margin-bottom:14px;font-weight:600;
    }
    .server-badge.online  { background:#dcfce7;color:#166534; }
    .server-badge.offline { background:#fef3c7;color:#92400e; }
    .server-badge .dot {
      width:7px;height:7px;border-radius:50%;
      background:currentColor;display:inline-block;
    }
  `;
  document.head.appendChild(s);
}

function buildPasswordRulesUI(insertAfterEl) {
  const bar = document.createElement('div');
  bar.className = 'pw-strength-bar';
  bar.innerHTML = '<div class="pw-strength-fill strength-0" id="pw-fill"></div>';

  const ul = document.createElement('ul');
  ul.className = 'pw-rules';
  ul.id = 'pw-rules-list';
  PW_RULES.forEach(r => {
    const li = document.createElement('li');
    li.id = r.id;
    li.innerHTML = `<i class="fas fa-circle ri"></i>${r.label}`;
    ul.appendChild(li);
  });

  insertAfterEl.insertAdjacentElement('afterend', ul);
  insertAfterEl.insertAdjacentElement('afterend', bar);
}

function evaluatePassword(pw) {
  const fill = document.getElementById('pw-fill');
  let score = 0;
  PW_RULES.forEach(r => {
    const li = document.getElementById(r.id);
    const passes = r.re.test(pw);
    if (passes) score++;
    if (li) {
      li.className = passes ? 'pass' : (pw.length ? 'fail' : '');
      li.querySelector('.ri').className = passes
        ? 'fas fa-check-circle ri'
        : 'fas fa-circle ri';
    }
  });
  if (fill) {
    fill.className = `pw-strength-fill strength-${score}`;
  }
  return score;
}

function isPasswordStrong(pw) {
  return PW_RULES.every(r => r.re.test(pw));
}

/* ══════════════════════════════════════════════
   GOOGLE OAUTH
   ══════════════════════════════════════════════ */
function initGoogleAuth() {
  // Load Google Identity Services script
  if (document.getElementById('google-gsi')) return;
  const s = document.createElement('script');
  s.id = 'google-gsi';
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.defer = true;
  s.onload = setupGoogleButton;
  document.head.appendChild(s);
}

function setupGoogleButton() {
  const metaClientId = document.querySelector('meta[name="google-client-id"]')?.content?.trim();
  const CLIENT_ID = window.SW_GOOGLE_CLIENT_ID || metaClientId || localStorage.getItem('sw_google_client_id') || '';
  if (!window.google || !CLIENT_ID || CLIENT_ID.includes('YOUR_GOOGLE')) {
    googleReady = false;
    return;
  }

  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
  });
  googleReady = true;

  // Render the official Google Sign-In button for real account selection
  const btnCustom = document.getElementById('btn-google-login');
  if (btnCustom && !document.getElementById('google-btn-wrap')) {
    const wrap = document.createElement('div');
    wrap.id = 'google-btn-wrap';
    wrap.style.cssText = 'width: 100%; display: flex; justify-content: center; margin-bottom: 14px;';
    btnCustom.parentNode.insertBefore(wrap, btnCustom);
    
    window.google.accounts.id.renderButton(wrap, { theme: 'outline', size: 'large', width: btnCustom.offsetWidth || 348 });
    btnCustom.style.display = 'none';
  }
}

async function handleGoogleCredential(response) {
  // Decode JWT payload (no verification needed client-side — server should verify in production)
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  const { email, name, sub: googleId, picture } = payload;

  // Check if user already exists
  const users = getLocalUsers();
  let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (user) {
    // Existing user — log in
    const { password: _, ...safe } = user;
    currentUser = mergeCachedUserProfile(safe);
  } else {
    // New Google user — auto-register
    const username = name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now().toString().slice(-4);
    const newUser = {
      id: 'google_' + googleId,
      email: email.toLowerCase(),
      username,
      password: null,
      googleId,
      avatar: picture,
      likedSongs: [], playlists: [], theme: 'default',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveLocalUsers(users);
    const { password: _, ...safe } = newUser;
    currentUser = mergeCachedUserProfile(safe);
  }

  cacheUserProfile(currentUser);
  localStorage.setItem('sw_user', JSON.stringify(currentUser));
  showAuthToast(`Welcome, ${currentUser.username}! 🎵`);
  await launchApp();
}

/* ── Stub Google login (when no Client ID set) ─ */
async function googleLoginStub() {
  const clientId = prompt("Google Login requires a Client ID.\n\nEnter your Google Client ID to enable real Google Login:\n(Or leave blank to simulate a demo login)");
  if (clientId) {
    localStorage.setItem('sw_google_client_id', clientId.trim());
    location.reload();
    return;
  }

  // Simulate a Google login with a demo account for testing
  const demoEmail = 'demo.google@soundwave.app';
  const users = getLocalUsers();
  let user = users.find(u => u.email === demoEmail);
  if (!user) {
    user = {
      id: 'google_demo_' + Date.now(),
      email: demoEmail,
      username: 'GoogleUser',
      password: null,
      googleId: 'demo',
      likedSongs: [], playlists: [], theme: 'default',
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveLocalUsers(users);
  }
  const { password: _, ...safe } = user;
  currentUser = mergeCachedUserProfile(safe);
  cacheUserProfile(currentUser);
  localStorage.setItem('sw_user', JSON.stringify(currentUser));
  showAuthToast('Signed in with Google (demo) 🎵');
  await launchApp();
}

/* ══════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════ */
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || '';
  }
}

function setFieldError(inputEl, errorElId, msg) {
  inputEl.closest('.form-group').classList.add('field-error');
  inputEl.closest('.form-group').classList.remove('field-ok');
  const el = document.getElementById(errorElId);
  if (el && msg) { el.textContent = msg; el.style.animation='none'; requestAnimationFrame(()=>el.style.animation=''); }
}

function setFieldOk(inputEl, errorElId) {
  inputEl.closest('.form-group').classList.remove('field-error');
  inputEl.closest('.form-group').classList.add('field-ok');
  const el = document.getElementById(errorElId);
  if (el) el.textContent = '';
}

function clearField(inputEl) {
  inputEl.closest('.form-group').classList.remove('field-error','field-ok');
}

function bindPasswordToggle(toggleId, inputId) {
  const toggle = document.getElementById(toggleId);
  const input  = document.getElementById(inputId);
  if (!toggle || !input) return;
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.className = `fas fa-eye${show ? '-slash' : ''} toggle-pw`;
    toggle.style.transform = 'scale(1.3)';
    setTimeout(() => toggle.style.transform = '', 150);
  });
}

function showServerBadge(cardEl, online) {
  let badge = cardEl.querySelector('.server-badge');
  if (!badge) {
    badge = document.createElement('div');
    cardEl.querySelector('.auth-sub').insertAdjacentElement('afterend', badge);
  }
  badge.className = `server-badge ${online ? 'online' : 'offline'}`;
  badge.innerHTML = `<span class="dot"></span>${online ? 'Server online' : 'Offline mode — data saved locally'}`;
}

function showAuthToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;top:20px;left:50%;transform:translateX(-50%);
    background:#1a1032;color:#fff;padding:10px 22px;border-radius:999px;
    font-size:14px;font-weight:600;z-index:9999;
    animation:fadeSlideIn 0.25s ease;white-space:nowrap;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

/* ══════════════════════════════════════════════
   LOGIN INIT
   ══════════════════════════════════════════════ */
function initLogin() {
  const btn        = document.getElementById('btn-login');
  const emailEl    = document.getElementById('login-emailOrUsername');
  const pwEl       = document.getElementById('login-password');
  const errEl      = document.getElementById('login-error');
  const card       = document.querySelector('#page-login .auth-card');

  bindPasswordToggle('toggle-login-pw', 'login-password');

  // Check server and show badge
  checkServer().then(online => showServerBadge(card, online));

  [emailEl, pwEl].forEach(el => el.addEventListener('input', () => clearField(el)));

  const doLogin = async () => {
    const emailOrUsername = emailEl.value.trim();
    const password = pwEl.value;
    errEl.textContent = '';
    let valid = true;

    if (!emailOrUsername) { setFieldError(emailEl, 'login-error', 'Email or username is required'); valid = false; }
    if (!password)        { setFieldError(pwEl,    'login-error', 'Password is required');          valid = false; }
    if (!valid) return;

    setLoading(btn, true);
    try {
      let data;
      if (serverAvailable) {
        const r = await fetch(`${AUTH_API}/login`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ emailOrUsername, password })
        });
        data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Login failed');
      } else {
        data = localLogin({ emailOrUsername, password });
        if (data.error) throw new Error(data.error);
      }
      setFieldOk(emailEl, 'login-error');
      setFieldOk(pwEl, 'login-error');
      currentUser = mergeCachedUserProfile(data.user);
      cacheUserProfile(currentUser);
      localStorage.setItem('sw_user', JSON.stringify(currentUser));
      await launchApp();
    } catch (e) {
      errEl.textContent = e.message || 'Login failed';
      setFieldError(emailEl, 'login-error', '');
      setFieldError(pwEl, 'login-error', '');
    } finally {
      setLoading(btn, false);
    }
  };

  btn.addEventListener('click', doLogin);
  [emailEl, pwEl].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));

  // Google login
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    if (googleReady && window.google && window.google.accounts) {
      window.google.accounts.id.prompt();
    } else {
      await googleLoginStub();
    }
  });

  // Guest
  document.getElementById('btn-guest').addEventListener('click', () => {
    currentUser = {
      id: 'guest_' + Date.now(), username: 'Guest',
      email: '', isGuest: true, likedSongs: [], playlists: [], theme: 'default'
    };
    cacheUserProfile(currentUser);
    localStorage.setItem('sw_user', JSON.stringify(currentUser));
    launchApp();
  });
}

/* ══════════════════════════════════════════════
   SIGNUP INIT
   ══════════════════════════════════════════════ */
function initSignup() {
  const btn       = document.getElementById('btn-signup');
  const emailEl   = document.getElementById('signup-email');
  const userEl    = document.getElementById('signup-username');
  const pwEl      = document.getElementById('signup-password');
  const cfmEl     = document.getElementById('signup-confirm');
  const errEl     = document.getElementById('signup-error');
  const card      = document.querySelector('#page-signup .auth-card');

  bindPasswordToggle('toggle-signup-pw', 'signup-password');
  buildPasswordRulesUI(pwEl.closest('.form-group'));
  checkServer().then(online => showServerBadge(card, online));

  // Live password evaluation
  pwEl.addEventListener('input', () => {
    evaluatePassword(pwEl.value);
    clearField(pwEl);
    if (cfmEl.value) validateConfirm();
  });

  // Live confirm match
  function validateConfirm() {
    if (!cfmEl.value) return;
    if (cfmEl.value !== pwEl.value) setFieldError(cfmEl, 'signup-error', 'Passwords do not match');
    else setFieldOk(cfmEl, 'signup-error');
  }
  cfmEl.addEventListener('input', validateConfirm);

  // Live email format
  emailEl.addEventListener('blur', () => {
    if (!emailEl.value) return;
    if (!/\S+@\S+\.\S+/.test(emailEl.value)) setFieldError(emailEl, 'signup-error', 'Enter a valid email address');
    else setFieldOk(emailEl, 'signup-error');
  });

  // Live username length
  userEl.addEventListener('blur', () => {
    if (!userEl.value) return;
    if (userEl.value.trim().length < 3) setFieldError(userEl, 'signup-error', 'Username must be at least 3 characters');
    else setFieldOk(userEl, 'signup-error');
  });

  [emailEl, userEl, pwEl, cfmEl].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
  });

  const doSignup = async () => {
    errEl.textContent = '';
    let valid = true;

    if (!emailEl.value || !/\S+@\S+\.\S+/.test(emailEl.value)) {
      setFieldError(emailEl, 'signup-error', 'Valid email address required'); valid = false;
    }
    if (!userEl.value || userEl.value.trim().length < 3) {
      setFieldError(userEl, 'signup-error', 'Username: minimum 3 characters'); valid = false;
    }
    if (!isPasswordStrong(pwEl.value)) {
      setFieldError(pwEl, 'signup-error', 'Password must meet all requirements below'); valid = false;
    }
    if (pwEl.value !== cfmEl.value) {
      setFieldError(cfmEl, 'signup-error', 'Passwords do not match'); valid = false;
    }
    if (!valid) return;

    setLoading(btn, true);
    try {
      let data;
      if (serverAvailable) {
        const r = await fetch(`${AUTH_API}/register`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email: emailEl.value.trim(), username: userEl.value.trim(), password: pwEl.value })
        });
        data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Registration failed');
      } else {
        data = localRegister({ email: emailEl.value, username: userEl.value, password: pwEl.value });
        if (data.error) throw new Error(data.error);
      }
      currentUser = mergeCachedUserProfile(data.user);
      cacheUserProfile(currentUser);
      localStorage.setItem('sw_user', JSON.stringify(currentUser));
      showAuthToast('Account created! Welcome to SoundWave 🎵');
      emailEl.value = '';
      userEl.value = '';
      pwEl.value = '';
      cfmEl.value = '';
      errEl.textContent = '';
      await launchApp();
    } catch (e) {
      errEl.textContent = e.message || 'Sign up failed';
      // Highlight duplicate field
      const msg = e.message || '';
      if (msg.toLowerCase().includes('email'))    setFieldError(emailEl, 'signup-error', '');
      if (msg.toLowerCase().includes('username')) setFieldError(userEl,  'signup-error', '');
    } finally {
      setLoading(btn, false);
    }
  };

  btn.addEventListener('click', doSignup);
}

/* ══════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  injectPasswordRulesCSS();
  initGoogleAuth();
  initLogin();
  initSignup();
});
