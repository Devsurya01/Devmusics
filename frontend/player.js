/* ══════════════════════════════════════════════
   player.js — Audio engine, player bar controls,
   progress, volume, shuffle, prev/next,
   smooth animated transitions
   ══════════════════════════════════════════════ */

let audioEl = null;
let currentSong = null;
let currentQueue = [];
let currentIndex = -1;
let isShuffle = false;
let isPlaying = false;
let isLoop = false;
let currentLyrics = [];

/* ── Init player after DOM ready ────────────── */
document.addEventListener('DOMContentLoaded', () => {
  audioEl = document.getElementById('audio-el');
  bindPlayerEvents();
  injectPlayerCSS();
});

function injectPlayerCSS() {
  if (document.getElementById('player-extra-css')) return;
  const s = document.createElement('style');
  s.id = 'player-extra-css';
  s.textContent = `
    /* Player bar slide-up on first song */
    @keyframes playerSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .player-bar.visible { animation: playerSlideUp 0.3s cubic-bezier(.4,0,.2,1); }

    /* Cover image crossfade */
    #player-cover { transition: opacity 0.25s ease, transform 0.25s ease; }
    #player-cover.changing { opacity: 0; transform: scale(0.92); }

    /* Title slide */
    #player-title, #player-artist {
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #player-title.changing, #player-artist.changing {
      opacity: 0; transform: translateX(-8px);
    }

    /* Play/pause button pulse */
    @keyframes playPulse {
      0%   { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 124,58,237), 0.5); }
      70%  { box-shadow: 0 0 0 10px rgba(var(--accent-rgb, 124,58,237), 0); }
      100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 124,58,237), 0); }
    }
    #btn-play.pulse { animation: playPulse 0.5s ease; }

    /* Shuffle / loop active glow */
    #btn-shuffle.active,
    #btn-loop.active {
      color: var(--accent) !important;
      background: color-mix(in srgb, var(--accent) 16%, transparent) !important;
    }

    /* Progress bar thumb */
    #progress-bar {
      background: linear-gradient(
        to right,
        var(--accent) 0%,
        var(--accent) var(--prog, 0%),
        var(--border) var(--prog, 0%),
        var(--border) 100%
      );
    }
    #volume-bar {
      background: linear-gradient(
        to right,
        var(--accent) 0%,
        var(--accent) var(--vol, 80%),
        var(--border) var(--vol, 80%),
        var(--border) 100%
      );
    }
    #progress-bar::-webkit-slider-thumb,
    #volume-bar::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 0 0 0 transparent;
    }
    #progress-bar:hover::-webkit-slider-thumb,
    #volume-bar:hover::-webkit-slider-thumb {
      transform: scale(1.25);
      box-shadow: 0 0 0 4px rgba(124,58,237,0.2);
    }

    /* Album cover spin while playing */
    @keyframes coverSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    #player-cover.spinning {
      border-radius: 50%;
      animation: coverSpin 8s linear infinite;
    }
    #player-cover:not(.spinning) { border-radius: var(--radius-sm); }

    /* Song card playing pulse border */
    @keyframes playingPulse {
      0%,100% { box-shadow: 0 0 0 2px var(--accent); }
      50%      { box-shadow: 0 0 0 5px rgba(124,58,237,0.2); }
    }
    .song-card.playing { animation: playingPulse 2s ease infinite; }
  `;
  document.head.appendChild(s);
}

/* ── Play a song ─────────────────────────────── */
function playSong(song, queue = []) {
  if (!audioEl) return;
  currentSong = song;
  currentQueue = [...queue];
  currentIndex = currentQueue.findIndex(s => s.id === song.id);
  updatePlayingCards(song.id);

  // Animate out
  animatePlayerChange(() => {
    // Update info
    document.getElementById('player-title').textContent = song.title;
    document.getElementById('player-artist').textContent = song.artist;
    const cover = document.getElementById('player-cover');
    cover.src = song.cover || `https://picsum.photos/seed/${song.id}/200`;
    cover.onerror = () => cover.src = `https://picsum.photos/seed/${song.id}/200`;

    // Load Lyrics
    currentLyrics = [];
    const lyricsEl = document.getElementById('lyrics-text');
    if (lyricsEl) lyricsEl.textContent = '';

    fetch(`/assets/${song.id}.lrc`)
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(text => {
         currentLyrics = parseLRC(text);
      })
      .catch(() => {
         if (lyricsEl) lyricsEl.textContent = '♪';
      });

    // Update audio
    audioEl.src = song.src || '';
    audioEl.volume = (parseInt(document.getElementById('volume-bar').value) / 100);
    audioEl.play().then(() => {
      setPlayState(true);
    }).catch(() => {
      // No actual mp3? still update UI
      setPlayState(false);
    });
  });

  // Show bar
  const bar = document.getElementById('player-bar');
  if (!bar.classList.contains('visible')) {
    bar.classList.add('visible');
  }

  // Update like button
  updatePlayerLikeBtn(song.id, currentUser?.likedSongs?.includes(song.id));
}

/* ── Animate cover + title crossfade ────────── */
function animatePlayerChange(callback) {
  const cover = document.getElementById('player-cover');
  const title = document.getElementById('player-title');
  const artist = document.getElementById('player-artist');
  [cover, title, artist].forEach(el => el.classList.add('changing'));
  setTimeout(() => {
    callback();
    [cover, title, artist].forEach(el => el.classList.remove('changing'));
  }, 200);
}

/* ── Play/Pause state ────────────────────────── */
function setPlayState(playing) {
  isPlaying = playing;
  const btn = document.getElementById('btn-play');
  btn.innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';
  // Pulse on play
  if (playing) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }
  // Cover spin
  const cover = document.getElementById('player-cover');
  if (playing) {
    cover.classList.add('spinning');
    if (currentSong) updatePlayingCards(currentSong.id);
  } else {
    cover.classList.remove('spinning');
  }
}

/* ── Bind all player controls ───────────────── */
function bindPlayerEvents() {
  const playBtn = document.getElementById('btn-play');
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const shuffleBtn = document.getElementById('btn-shuffle');
  const loopBtn = document.getElementById('btn-loop');
  const progressBar = document.getElementById('progress-bar');
  const volumeBar = document.getElementById('volume-bar');
  const likeBtn = document.getElementById('player-like-btn');

  // Play / Pause
  playBtn.addEventListener('click', () => {
    if (!audioEl.src && !currentSong) return;
    if (isPlaying) {
      audioEl.pause();
      setPlayState(false);
    } else {
      audioEl.play().then(() => setPlayState(true)).catch(() => setPlayState(false));
    }
    // Micro bounce
    playBtn.style.transform = 'scale(0.88)';
    setTimeout(() => playBtn.style.transform = '', 150);
  });

  // Prev
  prevBtn.addEventListener('click', () => {
    // If > 3s in, restart; else go to prev
    if (audioEl.currentTime > 3) {
      audioEl.currentTime = 0;
    } else {
      playPrev();
    }
    btnBounce(prevBtn);
  });

  // Next
  nextBtn.addEventListener('click', () => {
    playNext();
    btnBounce(nextBtn);
  });

  // Shuffle toggle
  shuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active', isShuffle);
    shuffleBtn.style.transform = 'scale(0.8) rotate(-15deg)';
    setTimeout(() => shuffleBtn.style.transform = '', 200);
    showToast(isShuffle ? 'Shuffle on' : 'Shuffle off');
  });

  // Loop toggle
  loopBtn.addEventListener('click', () => {
    isLoop = !isLoop;
    audioEl.loop = isLoop;
    loopBtn.classList.toggle('active', isLoop);
    loopBtn.style.transform = 'scale(0.82) rotate(20deg)';
    setTimeout(() => loopBtn.style.transform = '', 200);
    showToast(isLoop ? 'Loop on' : 'Loop off');
  });

  // Progress bar drag
  let isDragging = false;
  progressBar.addEventListener('mousedown', () => isDragging = true);
  progressBar.addEventListener('touchstart', () => isDragging = true, { passive: true });
  progressBar.addEventListener('input', () => {
    const pct = progressBar.value;
    progressBar.style.setProperty('--prog', `${pct}%`);
    if (audioEl.duration) {
      audioEl.currentTime = (pct / 100) * audioEl.duration;
    }
  });
  progressBar.addEventListener('change', () => isDragging = false);
  progressBar.addEventListener('touchend', () => isDragging = false);

  // Volume
  volumeBar.value = 80;
  volumeBar.style.setProperty('--vol', '80%');
  volumeBar.addEventListener('input', () => {
    const v = volumeBar.value;
    audioEl.volume = v / 100;
    volumeBar.style.setProperty('--vol', `${v}%`);
  });

  // Time update
  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration || isDragging) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    progressBar.value = pct;
    progressBar.style.setProperty('--prog', `${pct}%`);
    document.getElementById('time-cur').textContent = formatTime(audioEl.currentTime);
    document.getElementById('time-dur').textContent = formatTime(audioEl.duration);

    // Sync Lyrics
    if (currentLyrics.length) {
      const ct = audioEl.currentTime;
      let activeLine = '♪';
      for (let i = 0; i < currentLyrics.length; i++) {
        if (ct >= currentLyrics[i].time) {
          activeLine = currentLyrics[i].text;
          
          // Revert to musical note if there is a long pause (> 8s) or it's the last line
          const nextTime = currentLyrics[i + 1] ? currentLyrics[i + 1].time : (audioEl.duration || Infinity);
          if (ct > currentLyrics[i].time + 8 && nextTime - ct > 0.5) {
            activeLine = '♪';
          }
        } else {
          break;
        }
      }
      const lyricsEl = document.getElementById('lyrics-text');
      if (lyricsEl && lyricsEl.textContent !== activeLine) {
        lyricsEl.textContent = activeLine;
        lyricsEl.style.animation = 'none';
        void lyricsEl.offsetWidth; // Trigger reflow
        lyricsEl.style.animation = 'fadeInTab 0.3s ease';
      }
    }
  });

  // Auto-next on end
  audioEl.addEventListener('ended', () => {
    setPlayState(false);
    if (!isLoop) playNext();
  });

  // Like from player bar
  likeBtn.addEventListener('click', async () => {
    if (!currentSong) return;
    const allLikeBtns = document.querySelectorAll(`.like-btn[data-id="${currentSong.id}"]`);
    // Reuse app.js toggleLike by picking first card btn
    if (allLikeBtns.length) {
      await toggleLike(currentSong.id, allLikeBtns[0]);
    } else {
      await toggleLike(currentSong.id, likeBtn);
    }
    // Heart bounce on player
    likeBtn.style.transform = 'scale(1.4)';
    setTimeout(() => likeBtn.style.transform = '', 200);
  });
}

/* ── Prev / Next ─────────────────────────────── */
function playNext() {
  if (!currentQueue.length) return;
  if (isShuffle) {
    let idx;
    do { idx = Math.floor(Math.random() * currentQueue.length); }
    while (idx === currentIndex && currentQueue.length > 1);
    currentIndex = idx;
  } else {
    currentIndex = (currentIndex + 1) % currentQueue.length;
  }
  playSong(currentQueue[currentIndex], currentQueue);
}

function playPrev() {
  if (!currentQueue.length) return;
  currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
  playSong(currentQueue[currentIndex], currentQueue);
}

/* ── Update like button in player bar ────────── */
function updatePlayerLikeBtn(songId, liked) {
  const btn = document.getElementById('player-like-btn');
  if (!btn) return;
  if (currentSong && currentSong.id === songId) {
    btn.classList.toggle('liked', !!liked);
  }
}

/* ── Helpers ────────────────────────────────── */
function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function btnBounce(btn) {
  btn.style.transform = 'scale(0.82)';
  setTimeout(() => btn.style.transform = '', 150);
}

/* ── Parse LRC files ────────────────────────── */
function parseLRC(lrcText) {
  const lines = lrcText.split('\n');
  const regex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/;
  const result = [];
  for (const line of lines) {
    const match = line.match(regex);
    if (match) {  
      const m = parseInt(match[1], 10);
      const s = parseFloat(match[2]);
      const text = match[3].trim();
      result.push({ time: m * 60 + s, text: text || '♪' });
    }
  }
  return result;
}

function resetPlayer() {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
    audioEl.loop = false;
  }
  currentSong = null;
  currentQueue = [];
  currentIndex = -1;
  isShuffle = false;
  isLoop = false;
  isPlaying = false;

  document.getElementById('player-title').textContent = '—';
  document.getElementById('player-artist').textContent = '—';
  document.getElementById('player-cover').src = '';
  document.getElementById('time-cur').textContent = '0:00';
  document.getElementById('time-dur').textContent = '0:00';
  document.getElementById('progress-bar').value = 0;
  document.getElementById('progress-bar').style.setProperty('--prog', '0%');
  document.getElementById('btn-shuffle').classList.remove('active');
  document.getElementById('btn-loop').classList.remove('active');
  document.getElementById('player-like-btn').classList.remove('liked');
  const lyricsEl = document.getElementById('lyrics-text');
  if (lyricsEl) lyricsEl.textContent = '';
  currentLyrics = [];
  setPlayState(false);
  updatePlayingCards('');
}

function updatePlayingCards(songId) {
  document.querySelectorAll('.song-card').forEach(card => {
    card.classList.toggle('playing', card.dataset.id === songId);
  });
}
