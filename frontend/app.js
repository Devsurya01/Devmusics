/* ══════════════════════════════════════════════
   app.js — Main app logic: songs, library,
   playlists, search, UI routing
   ══════════════════════════════════════════════ */

const API = 'https://devmusics.onrender.com/api';

let allSongs = [];
let currentUser = null;
let activePlaylistId = null;
let pendingPlaylistSongId = null;
let isAppInitialized = false;

/* ── Ripple effect helper ───────────────────── */
function addRipple(btn) {
  btn.addEventListener('click', function (e) {
    const ripple = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;
      border-radius:50%;background:rgba(255,255,255,0.35);
      transform:scale(0);animation:ripple-anim 0.5s linear;
      left:${e.clientX - rect.left - size / 2}px;
      top:${e.clientY - rect.top - size / 2}px;
      pointer-events:none;z-index:10;
    `;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

function injectRippleCSS() {
  if (document.getElementById('ripple-style')) return;
  const s = document.createElement('style');
  s.id = 'ripple-style';
  s.textContent = `
    @keyframes ripple-anim {
      to { transform: scale(2.5); opacity: 0; }
    }
    .btn-primary, .btn-ghost, .btn-google, .btn-small,
    .pill, .nav-btn, .play-btn, .icon-btn {
      position: relative; overflow: hidden;
    }
    .btn-primary, .btn-ghost, .btn-google, .btn-small, .pill {
      transition: transform 0.15s ease, opacity 0.15s ease,
                  box-shadow 0.15s ease, background 0.15s ease !important;
    }
    .btn-primary:active, .btn-small:active { transform: scale(0.97) !important; }
    .btn-ghost:active, .btn-google:active { transform: scale(0.97) !important; }
    .pill:active { transform: scale(0.95) !important; }
    .icon-btn { transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease !important; }
    .icon-btn:active { transform: scale(0.88) !important; }
    .nav-btn { transition: color 0.15s ease, background 0.15s ease !important; }
    .nav-btn:active { transform: scale(0.93) !important; }
    .song-card {
      transition: transform 0.18s cubic-bezier(.4,0,.2,1),
                  box-shadow 0.18s ease, background 0.15s ease !important;
    }
    .song-card:active { transform: scale(0.97) translateY(-2px) !important; }
    .like-btn, .add-to-pl {
      transition: transform 0.15s cubic-bezier(.4,0,.2,1),
                  color 0.15s ease, background 0.15s ease !important;
    }
    .like-btn:active { transform: scale(1.35) !important; }
    .pl-item { transition: background 0.15s ease, transform 0.15s ease !important; }
    .pl-item:active { transform: scale(0.98) !important; }
    .theme-item { transition: transform 0.15s ease, border-color 0.15s ease !important; }
    .theme-item:active { transform: scale(0.95) !important; }
    input[type=range] { cursor: pointer; }
    input[type=range]::-webkit-slider-thumb {
      transition: transform 0.15s ease;
    }
    input[type=range]:active::-webkit-slider-thumb {
      transform: scale(1.3);
    }
  `;
  document.head.appendChild(s);
}

/* ── Page routing ───────────────────────────── */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const pg = document.getElementById(`page-${name}`);
  if (pg) {
    pg.classList.add('active');
    pg.style.display = 'flex';
    pg.style.opacity = '0';
    pg.style.transform = 'translateY(15px)';
    requestAnimationFrame(() => {
      pg.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      pg.style.opacity = '1';
      pg.style.transform = 'translateY(0)';
    });
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

  if (tab === 'library') renderLibrary();
  if (tab === 'settings') updateSettingsDetails();
}

function switchLib(lib) {
  document.querySelectorAll('.lib-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  document.getElementById(`lib-${lib}`).classList.add('active');
  document.querySelector(`[data-lib="${lib}"]`).classList.add('active');

  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

  if (lib === 'playlists') renderPlaylists();
}

/* ── Init ───────────────────────────────────── */
async function init() {
  injectRippleCSS();

  const saved = localStorage.getItem('sw_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      await launchApp();
    } catch (err) {
      localStorage.removeItem('sw_user');
      showPage('login');
    }
  } else {
    showPage('login');
  }

  // Bind all buttons with ripple
  setTimeout(() => {
    document.querySelectorAll(
      '.btn-primary, .btn-ghost, .btn-google, .btn-small, .pill, .nav-btn, .play-btn, .icon-btn'
    ).forEach(addRipple);
  }, 300);
}

async function launchApp() {
  showPage('app');
  if (typeof applyTheme === 'function') applyTheme(currentUser?.theme || 'default', false);
  updateUserUI();
  await loadSongs();
  renderHome();
  if (!isAppInitialized) {
    initSearch();
    initProfileMenu();
    initThemeModal();
    initSettingsControls();
    initPlaylistModal();
    isAppInitialized = true;
  }
}

/* ── User UI ────────────────────────────────── */
function updateUserUI() {
  if (!currentUser) return;
  const avatarEl = document.getElementById('avatar-text');
  const nameEl = document.getElementById('dropdown-username');
  const profileImg = getCurrentProfileImage();
  const initial = (currentUser.username || currentUser.email || 'G')[0].toUpperCase();

  renderAvatar(avatarEl, profileImg, initial);

  nameEl.textContent = currentUser.username || 'Guest';
  renderAvatar(document.querySelector('.settings-avatar'), profileImg, initial, '<i class="fas fa-user"></i>');
  updateSettingsDetails();
}

function getCurrentProfileImage() {
  return currentUser?.avatar || currentUser?.profileImage || currentUser?.photo || '';
}

function renderAvatar(el, src, fallbackText, fallbackHtml = '') {
  if (!el) return;
  el.style.backgroundImage = '';
  if (src) {
    el.innerHTML = `<img src="${src}" alt="Profile photo">`;
  } else {
    el.innerHTML = fallbackHtml || '';
    if (!fallbackHtml) el.textContent = fallbackText;
  }
}

function persistCurrentUser() {
  localStorage.setItem('sw_user', JSON.stringify(currentUser));
  if (typeof syncUserToLocalDB === 'function') syncUserToLocalDB(currentUser);
  if (typeof cacheUserProfile === 'function') cacheUserProfile(currentUser);
}

function setSettingsText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getAccountType() {
  if (!currentUser || currentUser.isGuest) return 'Guest';
  if (currentUser.googleId || currentUser.id?.startsWith('google_')) return 'Google';
  if (currentUser.id?.startsWith('local_')) return 'Offline';
  return 'Registered';
}

function formatJoinedDate(value) {
  if (!value) return 'Today';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function updateSettingsDetails() {
  if (!currentUser) return;
  const hasPhoto = Boolean(getCurrentProfileImage());
  setSettingsText('settings-detail-username', currentUser.username || 'Guest');
  setSettingsText('settings-hero-username', currentUser.username || 'Guest');
  setSettingsText('settings-detail-email', currentUser.email || 'Not added');
  setSettingsText('settings-hero-email', currentUser.email || 'No email connected');
  setSettingsText('settings-detail-type', getAccountType());
  setSettingsText('settings-detail-joined', formatJoinedDate(currentUser.createdAt));
  setSettingsText('settings-detail-liked', String(currentUser.likedSongs?.length || 0));
  setSettingsText('settings-detail-playlists', String(currentUser.playlists?.length || 0));
  setSettingsText('settings-detail-photo', hasPhoto ? 'Set' : 'Not set');

  const removePhoto = document.getElementById('btn-remove-photo');
  if (removePhoto) removePhoto.disabled = !hasPhoto;

  const dangerZone = document.querySelector('.settings-danger-zone');
  if (dangerZone) {
    dangerZone.style.display = (currentUser && currentUser.isGuest) ? 'none' : 'block';
  }
}

function initSettingsControls() {
  const changeName = document.getElementById('btn-change-username');
  const changePhoto = document.getElementById('btn-change-photo');
  const removePhoto = document.getElementById('btn-remove-photo');
  const deleteAccount = document.getElementById('btn-delete-account');
  const logoutButtons = document.querySelectorAll('.logout-btn');
  const profileFileInput = document.getElementById('profile-file-input');

  if (changeName) changeName.addEventListener('click', changeUsername);
  if (changePhoto) changePhoto.addEventListener('click', changeProfilePhoto);
  if (removePhoto) removePhoto.addEventListener('click', removeProfilePhoto);
  if (deleteAccount) deleteAccount.addEventListener('click', deleteAccountPermanently);
  if (logoutButtons.length) {
    logoutButtons.forEach(btn => btn.addEventListener('click', logout));
  }
  if (profileFileInput) profileFileInput.addEventListener('change', handleProfileFileUpload);
}

function changeUsername() {
  const input = document.getElementById('settings-username');
  if (!input) return;
  const value = input.value.trim();
  if (!value) {
    shakeInput('settings-username');
    showToast('Enter a username');
    return;
  }
  currentUser.username = value;
  persistCurrentUser();
  updateUserUI();
  showToast('Username updated!');
  input.value = '';
  syncUsernameToServer(value);
}

function changeProfilePhoto() {
  const input = document.getElementById('profile-file-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function removeProfilePhoto() {
  if (!currentUser || !getCurrentProfileImage()) return;
  delete currentUser.avatar;
  delete currentUser.profileImage;
  delete currentUser.photo;
  updateUserUI();
  persistCurrentUser();
  showToast('Profile photo removed');
  syncProfilePhotoRemovalToServer();
}

function handleProfileFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) {
    showToast('Choose an image file');
    return;
  }

  imageFileToAvatarDataUrl(file).then((avatarDataUrl) => {
    currentUser.avatar = avatarDataUrl;
    currentUser.profileImage = avatarDataUrl;
    updateUserUI();
    try {
      persistCurrentUser();
    } catch (err) {
      console.error('Profile photo save failed:', err);
      showToast('Photo changed, but could not be saved');
      return;
    }
    showToast('Profile photo updated!');
    syncProfilePhotoToServer(avatarDataUrl);
  }).catch(() => {
    showToast('Could not update photo');
  });
}

function imageFileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const rawDataUrl = reader.result;
      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const sw = size / scale;
        const sh = size / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;

        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function syncProfilePhotoToServer(avatarDataUrl) {
  if (!currentUser?.id || currentUser.isGuest || currentUser.id.startsWith('local_')) return;
  try {
    await fetch(`${API}/users/${currentUser.id}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: avatarDataUrl })
    });
  } catch (e) {
    console.error('Profile photo sync failed:', e);
  }
}

async function syncProfilePhotoRemovalToServer() {
  if (!currentUser?.id || currentUser.isGuest || currentUser.id.startsWith('local_')) return;
  try {
    await fetch(`${API}/users/${currentUser.id}/profile`, {
      method: 'DELETE'
    });
  } catch (e) {
    console.error('Profile photo removal sync failed:', e);
  }
}

async function syncUsernameToServer(username) {
  if (!currentUser?.id || currentUser.isGuest || currentUser.id.startsWith('local_')) return;
  try {
    await fetch(`${API}/users/${currentUser.id}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
  } catch (e) {
    console.error('Username sync failed:', e);
  }
}

async function syncPlaylistDeleteToServer(playlistId) {
  if (!currentUser?.id || currentUser.isGuest || currentUser.id.startsWith('local_')) return;
  try {
    await fetch(`${API}/users/${currentUser.id}/playlists/${playlistId}`, {
      method: 'DELETE'
    });
  } catch (e) {
    console.error('Playlist delete sync failed:', e);
  }
}

function deleteAccountPermanently() {
  if (!currentUser) return;
  const confirmDelete = confirm(
    `⚠️  Are you sure you want to permanently delete your account and all data?\n\nThis action cannot be undone!\n\nYour username: ${currentUser.username}`
  );
  if (!confirmDelete) return;

  const finalConfirm = confirm('This is your last chance. Type "DELETE" in your head... Really sure?');
  if (!finalConfirm) return;

  try {
    localStorage.removeItem('sw_user');
    
    const cache = JSON.parse(localStorage.getItem('sw_user_profiles') || '{}');
    if (currentUser.id && cache[currentUser.id]) {
      delete cache[currentUser.id];
      localStorage.setItem('sw_user_profiles', JSON.stringify(cache));
    }

    const users = JSON.parse(localStorage.getItem('sw_users_db') || '[]');
    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx >= 0) {
      users.splice(idx, 1);
      localStorage.setItem('sw_users_db', JSON.stringify(users));
    }
    if (currentUser.id && !currentUser.id.startsWith('local_')) {
      fetch(`${API}/users/${currentUser.id}`, { method: 'DELETE' }).catch(() => {});
    }
    showToast('Account deleted. Please register again.', 3000);
    setTimeout(() => {
      currentUser = null;
      allSongs = [];
      activePlaylistId = null;
      if (typeof resetPlayer === 'function') resetPlayer();
      
      document.querySelectorAll('input').forEach(input => input.value = '');
      showPage('signup');
    }, 1500);
  } catch (e) {
    showToast('Could not delete account');
  }
}

function logout() {
  const isGuest = currentUser ? currentUser.isGuest : false;
  localStorage.removeItem('sw_user');
  if (isGuest && typeof applyTheme === 'function') applyTheme('default', false);
  if (typeof resetPlayer === 'function') resetPlayer();
  currentUser = null;
  allSongs = [];
  activePlaylistId = null;

  const loginPage = document.getElementById('page-login');
  const appPage = document.getElementById('page-app');

  showPage('login');

  if (appPage) appPage.classList.remove('active');
  if (loginPage) {
    loginPage.classList.add('active');
    loginPage.style.opacity = '0';
    requestAnimationFrame(() => {
      loginPage.style.transition = 'opacity 0.25s ease';
      loginPage.style.opacity = '1';
    });
  }

  const profileDropdown = document.getElementById('profile-dropdown');
  if (profileDropdown) profileDropdown.classList.add('hidden');

  document.querySelectorAll('input').forEach(input => input.value = '');
  document.querySelectorAll('.form-group').forEach(fg => {
    fg.classList.remove('field-error', 'field-ok');
  });
  const errEls = document.querySelectorAll('.error-msg');
  errEls.forEach(el => el.textContent = '');

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
}

/* ── Songs ──────────────────────────────────── */
async function loadSongs() {
  try {
    const r = await fetch(`${API}/songs`);
    allSongs = await r.json();
  } catch (e) {
    console.error('Could not load songs:', e);
    allSongs = [];
  }
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

/* ── Song Card Builder ──────────────────────── */
function buildSongCard(song, opts = {}) {
  const isLiked = currentUser?.likedSongs?.includes(song.id);
  const card = document.createElement('div');
  const isCurrentSong = typeof currentSong !== 'undefined' && currentSong?.id === song.id;
  card.className = 'song-card' + (opts.playing || isCurrentSong ? ' playing' : '');
  card.dataset.id = song.id;

  card.innerHTML = `
    <div class="card-actions">
      ${opts.showAddToPlaylist ? `
        <button class="add-to-pl" title="Add to playlist" data-id="${song.id}">
          <i class="fas fa-plus"></i>
        </button>` : ''}
      <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${song.id}" title="${isLiked ? 'Unlike' : 'Like'}">
        <i class="fas fa-heart"></i>
      </button>
    </div>
    <div class="card-img-wrap">
      <img src="${song.cover}" alt="${song.title}" loading="lazy"
           onerror="this.src='https://picsum.photos/seed/${song.id}/200'"/>
      <div class="play-overlay"><i class="fas fa-play"></i></div>
    </div>
    <p class="s-title">${song.title}</p>
    <p class="s-artist">${song.artist}</p>
    <span class="s-genre">${song.genre}</span>
  `;

  // Play on card click (not on action buttons)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.like-btn') || e.target.closest('.add-to-pl')) return;
    playSong(song, opts.queue || allSongs);
  });

  // Like button
  const likeBtn = card.querySelector('.like-btn');
  likeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleLike(song.id, likeBtn);
  });

  // Add to playlist button
  const addBtn = card.querySelector('.add-to-pl');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showAddToPlaylistPicker(song.id);
    });
  }

  return card;
}

/* ── Home ───────────────────────────────────── */
function renderHome(songs = allSongs) {
  const grid = document.getElementById('song-grid');
  grid.innerHTML = '';
  if (!songs.length) {
    grid.innerHTML = '<p class="empty-msg">No songs found.</p>';
    return;
  }
  songs.forEach(song => {
    grid.appendChild(buildSongCard(song, { showAddToPlaylist: true }));
  });
  addRippleToNewCards();
}

/* ── Search ─────────────────────────────────── */
function initSearch() {
  const input = document.getElementById('search-input');
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (!q) { renderHome(); return; }
      const filtered = allSongs.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        (s.mood || '').toLowerCase().includes(q)
      );
      // Switch to home tab to show results
      switchTab('home');
      renderHome(filtered);
    }, 250);
  });
}

/* ── Like / Unlike ──────────────────────────── */
async function toggleLike(songId, btnEl) {
  if (!currentUser || currentUser.isGuest) {
    showToast('Log in to like songs');
    return;
  }
  const wasLiked = currentUser.likedSongs?.includes(songId);
  if (!currentUser.likedSongs) currentUser.likedSongs = [];

  if (wasLiked) {
    currentUser.likedSongs = currentUser.likedSongs.filter(id => id !== songId);
  } else {
    currentUser.likedSongs.push(songId);
  }
  persistCurrentUser();

  document.querySelectorAll(`.like-btn[data-id="${songId}"]`).forEach(b => {
    b.classList.toggle('liked', !wasLiked);
    b.title = !wasLiked ? 'Unlike' : 'Like';
    b.style.transform = 'scale(1.4)';
    setTimeout(() => b.style.transform = '', 200);
  });
  updatePlayerLikeBtn(songId, !wasLiked);

  if (!wasLiked) {
    switchTab('library');
    switchLib('liked');
    renderLikedSongs();
  } else if (document.getElementById('tab-library').classList.contains('active') &&
             document.querySelector('.lib-pills .pill.active')?.dataset.lib === 'liked') {
    renderLikedSongs();
  }

  try {
    const r = await fetch(`${API}/users/${currentUser.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId })
    });
    const data = await r.json();
    currentUser.likedSongs = data.likedSongs;
    persistCurrentUser();
  } catch (e) {
    console.error('Like sync failed:', e);
  }
}

/* ── Library ────────────────────────────────── */
function renderLibrary() {
  renderLikedSongs();
  renderPlaylists();
}

function renderLikedSongs() {
  const grid = document.getElementById('liked-grid');
  const empty = document.getElementById('liked-empty');
  grid.innerHTML = '';
  const liked = (currentUser?.likedSongs || []);
  const songs = allSongs.filter(s => liked.includes(s.id));
  if (!songs.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  songs.forEach(s => grid.appendChild(buildSongCard(s, { showAddToPlaylist: true })));
  addRippleToNewCards();
}

async function renderPlaylists() {
  const list = document.getElementById('playlist-list');
  const grid = document.getElementById('playlist-songs-grid');
  list.innerHTML = '';
  grid.innerHTML = '';
  if (!currentUser || currentUser.isGuest) {
    list.innerHTML = '<p class="empty-msg">Log in to create playlists.</p>';
    return;
  }
  let playlists = currentUser.playlists || [];
  if (!playlists.length) {
    list.innerHTML = '<p class="empty-msg" style="text-align:left;padding:16px 0">No playlists yet. Tap + New Playlist!</p>';
    return;
  }
  playlists.forEach(pl => {
    if (!Array.isArray(pl.songs)) pl.songs = [];
    const safeName = escapeHTML(pl.name);
    const item = document.createElement('div');
    item.className = 'pl-item' + (activePlaylistId === pl.id ? ' active' : '');
    item.dataset.id = pl.id;
    item.innerHTML = `
      <div class="pl-icon"><i class="fas fa-music"></i></div>
      <div class="pl-meta">
        <p class="pl-name">${safeName}</p>
        <p class="pl-count">${pl.songs.length} song${pl.songs.length !== 1 ? 's' : ''}</p>
      </div>
      <button type="button" class="pl-delete-btn" title="Delete playlist">
        <i class="fas fa-trash"></i>
      </button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.pl-delete-btn')) return;
      activePlaylistId = pl.id;
      document.querySelectorAll('.pl-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderPlaylistSongs(pl);
    });
    const deleteBtn = item.querySelector('.pl-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePlaylist(pl.id);
    });
    list.appendChild(item);
  });
  const activePlaylist = playlists.find(pl => pl.id === activePlaylistId) || playlists[0];
  activePlaylistId = activePlaylist.id;
  list.querySelectorAll('.pl-item').forEach(item => {
    if (item.dataset.id === activePlaylistId) item.classList.add('active');
  });
  renderPlaylistSongs(activePlaylist);
}

function renderPlaylistSongs(pl) {
  const grid = document.getElementById('playlist-songs-grid');
  grid.innerHTML = '';
  const safeName = escapeHTML(pl.name);
  if (!pl.songs.length) {
    grid.innerHTML = `
      <div class="playlist-empty-help">
        <div class="pl-icon"><i class="fas fa-music"></i></div>
        <h3>${safeName}</h3>
        <p>No songs here yet. Browse songs and use the + button to add your favorites.</p>
        <button class="btn-small" type="button" id="btn-browse-songs">
          <i class="fas fa-compass"></i> Browse Songs
        </button>
      </div>
    `;
    const browseBtn = document.getElementById('btn-browse-songs');
    if (browseBtn) browseBtn.addEventListener('click', () => switchTab('home'));
    return;
  }
  const songs = allSongs.filter(s => pl.songs.includes(s.id));
  const header = document.createElement('div');
  header.className = 'playlist-songs-header';
  header.innerHTML = `
    <div>
      <p class="playlist-kicker">Playlist</p>
      <h3>${safeName}</h3>
    </div>
    <span>${songs.length} song${songs.length !== 1 ? 's' : ''}</span>
  `;
  grid.appendChild(header);
  songs.forEach(s => grid.appendChild(buildSongCard(s, { queue: songs })));
  addRippleToNewCards();
}

function deletePlaylist(playlistId) {
  if (!currentUser || currentUser.isGuest) return;
  const idx = (currentUser.playlists || []).findIndex(pl => pl.id === playlistId);
  if (idx < 0) return;
  const removed = currentUser.playlists.splice(idx, 1)[0];
  if (activePlaylistId === playlistId) {
    activePlaylistId = currentUser.playlists[0]?.id || null;
  }
  persistCurrentUser();
  syncPlaylistDeleteToServer(playlistId);
  renderPlaylists();
  showToast(`Deleted playlist "${removed.name}"`);
}

/* ── Playlist Modal ─────────────────────────── */
function initPlaylistModal() {
  document.getElementById('btn-new-playlist').addEventListener('click', () => {
    document.getElementById('playlist-modal').classList.remove('hidden');
    document.getElementById('new-playlist-name').focus();
  });

  document.getElementById('btn-create-playlist').addEventListener('click', createPlaylist);

  document.getElementById('playlist-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('playlist-modal')) closePlaylistModal();
  });

  document.getElementById('new-playlist-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createPlaylist();
  });

  const addModal = document.getElementById('add-playlist-modal');
  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) closeAddToPlaylistModal();
    });
  }

  const createFromAdd = document.getElementById('btn-create-playlist-from-add');
  if (createFromAdd) {
    createFromAdd.addEventListener('click', () => {
      closeAddToPlaylistModal(true);
      document.getElementById('playlist-modal').classList.remove('hidden');
      document.getElementById('new-playlist-name').focus();
    });
  }
}

function closePlaylistModal() {
  document.getElementById('playlist-modal').classList.add('hidden');
  document.getElementById('new-playlist-name').value = '';
}

async function createPlaylist() {
  const name = document.getElementById('new-playlist-name').value.trim();
  if (!name) return shakeInput('new-playlist-name');
  const btn = document.getElementById('btn-create-playlist');
  btn.textContent = 'Creating…';
  btn.disabled = true;
  try {
    let pl;
    try {
      const r = await fetch(`${API}/users/${currentUser.id}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      pl = await r.json();
    } catch (_e) {
      pl = { id: `local_pl_${Date.now()}`, name, songs: [] };
    }
    if (!currentUser.playlists) currentUser.playlists = [];
    currentUser.playlists.push(pl);
    persistCurrentUser();
    closePlaylistModal();
    activePlaylistId = pl.id;
    switchLib('playlists');
    renderPlaylists();
    showToast(`Playlist "${name}" created!`);
    if (pendingPlaylistSongId) showAddToPlaylistPicker(pendingPlaylistSongId);
  } catch (e) {
    showToast('Could not create playlist');
  } finally {
    btn.textContent = 'Create';
    btn.disabled = false;
  }
}

/* ── Add to Playlist picker ─────────────────── */
function showAddToPlaylistPicker(songId) {
  if (!currentUser || currentUser.isGuest) {
    showToast('Log in to add songs to playlists');
    return;
  }
  const playlists = currentUser?.playlists || [];
  if (!playlists.length) {
    pendingPlaylistSongId = songId;
    document.getElementById('playlist-modal').classList.remove('hidden');
    document.getElementById('new-playlist-name').focus();
    showToast('Create a playlist first');
    return;
  }
  pendingPlaylistSongId = songId;
  renderPlaylistChoiceModal(songId);
  document.getElementById('add-playlist-modal').classList.remove('hidden');
}

function renderPlaylistChoiceModal(songId) {
  const song = allSongs.find(s => s.id === songId);
  const list = document.getElementById('playlist-choice-list');
  const cover = document.getElementById('add-song-cover');
  const title = document.getElementById('add-song-title');
  const artist = document.getElementById('add-song-artist');
  if (!song || !list) return;

  if (cover) cover.src = song.cover;
  if (title) title.textContent = song.title;
  if (artist) artist.textContent = song.artist;

  list.innerHTML = '';
  const playlists = currentUser?.playlists || [];
  playlists.forEach(pl => {
    if (!Array.isArray(pl.songs)) pl.songs = [];
    const safeName = escapeHTML(pl.name);
    const btn = document.createElement('button');
    const alreadyAdded = pl.songs.includes(songId);
    btn.className = 'playlist-choice' + (alreadyAdded ? ' is-added' : '');
    btn.type = 'button';
    btn.disabled = alreadyAdded;
    btn.innerHTML = `
      <span class="pl-choice-icon"><i class="fas fa-list"></i></span>
      <span>
        <strong>${safeName}</strong>
        <small>${alreadyAdded ? 'Already in this playlist' : `${pl.songs.length} song${pl.songs.length !== 1 ? 's' : ''}`}</small>
      </span>
      <i class="fas ${alreadyAdded ? 'fa-check' : 'fa-plus'}"></i>
    `;
    btn.addEventListener('click', async () => {
      await addSongToPlaylist(pl.id, songId);
    });
    list.appendChild(btn);
  });
}

function closeAddToPlaylistModal(keepPending = false) {
  const modal = document.getElementById('add-playlist-modal');
  if (modal) modal.classList.add('hidden');
  if (!keepPending) pendingPlaylistSongId = null;
}

async function addSongToPlaylist(playlistId, songId) {
  try {
    const pl = currentUser.playlists.find(p => p.id === playlistId);
    if (!pl) {
      showToast('Playlist not found');
      return;
    }
    if (pl.songs.includes(songId)) {
      showToast('Already in that playlist');
      return;
    }
    try {
      await fetch(`${API}/users/${currentUser.id}/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
    } catch (_e) {
      // local fallback if server is unavailable
    }
    pl.songs.push(songId);
    persistCurrentUser();
    activePlaylistId = playlistId;
    pendingPlaylistSongId = null;
    closeAddToPlaylistModal();
    switchTab('library');
    switchLib('playlists');
    renderPlaylists();
    showToast(`Added to "${pl.name}"`);
  } catch (e) {
    showToast('Could not add song');
  }
}

/* ── Profile Dropdown ───────────────────────── */
function initProfileMenu() {
  const btn = document.getElementById('profile-menu-btn');
  const drop = document.getElementById('profile-dropdown');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    drop.classList.toggle('hidden');
  });
  document.addEventListener('click', () => drop.classList.add('hidden'));
}

/* ── Theme Modal ────────────────────────────── */
function initThemeModal() {
  document.getElementById('btn-theme-picker').addEventListener('click', () => {
    document.getElementById('theme-modal').classList.remove('hidden');
    renderThemeGrid();
  });
  document.getElementById('theme-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('theme-modal')) closeThemeModal();
  });
}

function closeThemeModal() {
  document.getElementById('theme-modal').classList.add('hidden');
}

/* ── Toast ──────────────────────────────────── */
function showToast(msg, duration = 2500) {
  const existing = document.getElementById('sw-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'sw-toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:170px;left:50%;transform:translateX(-50%) translateY(10px);
    background:var(--accent);color:var(--accent-text);
    padding:10px 22px;border-radius:999px;font-size:14px;font-weight:600;
    z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.18);
    animation:toastIn 0.25s ease forwards;
    white-space:nowrap;
  `;
  if (!document.getElementById('toast-anim')) {
    const s = document.createElement('style');
    s.id = 'toast-anim';
    s.textContent = `
      @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(14px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      @keyframes toastOut { to{opacity:0;transform:translateX(-50%) translateY(10px)} }
    `;
    document.head.appendChild(s);
  }
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ── Input shake animation ──────────────────── */
function shakeInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  if (!document.getElementById('shake-anim')) {
    const s = document.createElement('style');
    s.id = 'shake-anim';
    s.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`;
    document.head.appendChild(s);
  }
  el.style.animation = 'shake 0.3s ease';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

/* ── Attach ripple to dynamically created cards */
function addRippleToNewCards() {
  document.querySelectorAll('.like-btn, .add-to-pl').forEach(btn => {
    if (!btn.dataset.ripple) {
      btn.dataset.ripple = '1';
      addRipple(btn);
    }
  });
}

/* ── Start ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
