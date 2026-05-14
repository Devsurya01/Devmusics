const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const DATA = path.join(__dirname, 'data');

function readJSON(file) {
  const fp = path.join(DATA, file);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]');
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2));
}

// ── REGISTER ──────────────────────────────────
router.post('/register', (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password)
    return res.status(400).json({ error: 'All fields are required.' });

  const users = readJSON('users.json');

  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'An account with this email already exists.' });

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: 'That username is already taken.' });

  const user = {
    id: Date.now().toString(),
    email: email.toLowerCase().trim(),
    username: username.trim(),
    password,           // hash with bcrypt in production!
    likedSongs: [],
    playlists: [],
    theme: 'default',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJSON('users.json', users);

  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

// ── LOGIN ──────────────────────────────────────
router.post('/login', (req, res) => {
  const { emailOrUsername, password } = req.body;
  if (!emailOrUsername || !password)
    return res.status(400).json({ error: 'All fields are required.' });

  const users = readJSON('users.json');
  const q = emailOrUsername.toLowerCase().trim();
  const user = users.find(u =>
    (u.email?.toLowerCase() === q || u.username?.toLowerCase() === q) && u.password === password
  );

  if (!user)
    return res.status(401).json({ error: 'Incorrect email/username or password.' });

  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

// ── SONGS ──────────────────────────────────────
router.get('/songs', (req, res) => {
  res.json(readJSON('songs.json'));
});

// ── LIKE / UNLIKE ──────────────────────────────
router.post('/users/:id/like', (req, res) => {
  const { songId, action, likedSongs } = req.body;
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  if (likedSongs && Array.isArray(likedSongs)) {
    // Exact array provided by client prevents async toggle bugs
    users[idx].likedSongs = likedSongs;
  } else {
    const liked = users[idx].likedSongs || [];
    if (action === 'like' && !liked.includes(songId)) {
      users[idx].likedSongs.push(songId);
    } else if (action === 'unlike') {
      users[idx].likedSongs = liked.filter(id => id !== songId);
    }
  }

  writeJSON('users.json', users);
  res.json({ likedSongs: users[idx].likedSongs });
});

// ── PLAYLISTS ──────────────────────────────────
router.get('/users/:id/playlists', (req, res) => {
  const users = readJSON('users.json');
  const user  = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user.playlists || []);
});

router.post('/users/:id/playlists', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Playlist name required.' });

  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const playlist = { id: Date.now().toString(), name: name.trim(), songs: [] };
  if (!users[idx].playlists) users[idx].playlists = [];
  users[idx].playlists.push(playlist);
  writeJSON('users.json', users);
  res.json(playlist);
});

router.post('/users/:id/playlists/:pid/songs', (req, res) => {
  const { songId } = req.body;
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const pl = (users[idx].playlists || []).find(p => p.id === req.params.pid);
  if (!pl) return res.status(404).json({ error: 'Playlist not found.' });

  if (!pl.songs.includes(songId)) pl.songs.push(songId);
  writeJSON('users.json', users);
  res.json(pl);
});

// ── THEME ──────────────────────────────────────
router.delete('/users/:id/playlists/:pid', (req, res) => {
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const before = users[idx].playlists || [];
  const next = before.filter(p => p.id !== req.params.pid);
  if (next.length === before.length) return res.status(404).json({ error: 'Playlist not found.' });

  users[idx].playlists = next;
  writeJSON('users.json', users);
  res.json({ playlists: next });
});

router.post('/users/:id/theme', (req, res) => {
  const { theme } = req.body;
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].theme = theme;
  writeJSON('users.json', users);
  res.json({ theme });
});

// Update profile photo
router.post('/users/:id/profile', (req, res) => {
  const { avatar } = req.body;
  if (!avatar) return res.status(400).json({ error: 'Profile photo required.' });

  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].avatar = avatar;
  users[idx].profileImage = avatar;
  writeJSON('users.json', users);
  res.json({ avatar });
});

router.delete('/users/:id/profile', (req, res) => {
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  delete users[idx].avatar;
  delete users[idx].profileImage;
  writeJSON('users.json', users);
  res.json({ removed: true });
});

router.patch('/users/:id/profile', (req, res) => {
  const { username } = req.body;
  const users = readJSON('users.json');
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  if (typeof username === 'string') {
    const cleanName = username.trim();
    if (!cleanName) return res.status(400).json({ error: 'Username required.' });
    const taken = users.some(u =>
      u.id !== req.params.id &&
      u.username?.toLowerCase() === cleanName.toLowerCase()
    );
    if (taken) return res.status(409).json({ error: 'That username is already taken.' });
    users[idx].username = cleanName;
  }

  writeJSON('users.json', users);
  const { password: _, ...safe } = users[idx];
  res.json({ user: safe });
});

module.exports = router;
