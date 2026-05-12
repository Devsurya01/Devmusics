/* ══════════════════════════════════════════════
   theme.js — 10 Instagram-style themes,
   live preview, smooth transitions,
   persisted per user
   ══════════════════════════════════════════════ */

const THEMES = [
  {
    id: 'default',
    label: 'Violet Dream',
    emoji: '💜',
    category: 'All',
    colors: ['#7c3aed', '#a855f7', '#f5f0ff'],
    desc: 'Soft purple — the default vibe'
  },
  {
    id: 'ocean',
    label: 'Deep Ocean',
    emoji: '🌊',
    category: 'Calm',
    colors: ['#0284c7', '#38bdf8', '#e0f2fe'],
    desc: 'Cool blue tones, calm mood'
  },
  {
    id: 'rose',
    label: 'Rose Rush',
    emoji: '🌹',
    category: 'Romantic',
    colors: ['#e11d48', '#fb7185', '#fff1f2'],
    desc: 'Bold rose for passionate moods'
  },
  {
    id: 'forest',
    label: 'Deep Forest',
    emoji: '🌿',
    category: 'Calm',
    colors: ['#16a34a', '#4ade80', '#f0fdf4'],
    desc: 'Fresh greens, earthy calm'
  },
  {
    id: 'sunset',
    label: 'Sunset Burn',
    emoji: '🌅',
    category: 'Energetic',
    colors: ['#ea580c', '#fb923c', '#fff7ed'],
    desc: 'Warm orange, high energy'
  },
  {
    id: 'midnight',
    label: 'Midnight',
    emoji: '🌙',
    category: 'Dark',
    colors: ['#818cf8', '#a5b4fc', '#0f0f1a'],
    desc: 'Deep dark mode for night owls'
  },
  {
    id: 'sakura',
    label: 'Sakura',
    emoji: '🌸',
    category: 'Romantic',
    colors: ['#db2777', '#f472b6', '#fdf2f8'],
    desc: 'Soft pink, dreamy & romantic'
  },
  {
    id: 'golden',
    label: 'Golden Hour',
    emoji: '✨',
    category: 'Energetic',
    colors: ['#d97706', '#fbbf24', '#fffbeb'],
    desc: 'Warm gold — feels expensive'
  },
  {
    id: 'neon',
    label: 'Neon Rave',
    emoji: '⚡',
    category: 'Dark',
    colors: ['#00ff87', '#00cfff', '#0a0a0a'],
    desc: 'Neon on black — pure energy'
  },
  {
    id: 'lavender',
    label: 'Lavender Sky',
    emoji: '☁️',
    category: 'All',
    colors: ['#7c3aed', '#8b5cf6', '#f5f3ff'],
    desc: 'Airy lavender, light & clean'
  },
  {
    id: 'ig-dark',
    label: 'IG Dark',
    emoji: '💬',
    category: 'Dark',
    colors: ['#833ab4', '#fd1d1d', '#fcb045'],
    desc: 'Instagram chat gradient (Dark)'
  },
  {
    id: 'lofi',
    label: 'Lofi Vibes',
    emoji: '🎧',
    category: 'Wallpaper',
    colors: ['#ff71ce', '#01cdfe', '#2d1b4e'],
    desc: 'Requires /assets/lofi.jpg'
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    emoji: '🏙️',
    category: 'Wallpaper',
    colors: ['#0ff0fc', '#f38181', '#0d0221'],
    desc: 'Requires /assets/cyberpunk.jpg'
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    emoji: '🌌',
    category: 'Wallpaper',
    colors: ['#8b5cf6', '#d946ef', '#0b0c10'],
    desc: 'Requires /assets/galaxy.jpg'
  }
];

let activeTheme = 'default';

/* ── Apply theme to document ────────────────── */
function applyTheme(themeId, animate = true) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const body = document.body;

  if (animate) {
    // Smooth full-page transition
    body.style.transition = 'background 0.4s ease, color 0.4s ease';
    // Also transition all surfaces
    injectThemeTransitionCSS();
  }

  body.setAttribute('data-theme', theme.id);
  activeTheme = theme.id;

  // Save to localStorage
  const saved = localStorage.getItem('sw_user');
  if (saved) {
    const user = JSON.parse(saved);
    user.theme = theme.id;
    localStorage.setItem('sw_user', JSON.stringify(user));
    if (typeof syncUserToLocalDB === 'function') syncUserToLocalDB(user);
    if (typeof cacheUserProfile === 'function') cacheUserProfile(user);
    // Sync to server in background
    if (user.id && !user.isGuest && !user.id.startsWith('guest_') && !user.id.startsWith('local_')) {
      fetch(`http://localhost:3000/api/users/${user.id}/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme.id })
      }).catch(() => {});
    }
  }

  // Persist globally so the login screen keeps the user's theme after logout
  if (!saved || !JSON.parse(saved).isGuest) {
    localStorage.setItem('sw_last_theme', theme.id);
  }

  // Update active state in grid if open
  document.querySelectorAll('.theme-item').forEach(item => {
    item.classList.toggle('active', item.dataset.theme === theme.id);
  });

  if (animate) {
    setTimeout(() => body.style.transition = '', 500);
  }
}

function injectThemeTransitionCSS() {
  if (document.getElementById('theme-transition-css')) return;
  const s = document.createElement('style');
  s.id = 'theme-transition-css';
  s.textContent = `
    * {
      transition:
        background-color 0.35s ease,
        border-color 0.35s ease,
        color 0.25s ease,
        box-shadow 0.35s ease !important;
    }
  `;
  document.head.appendChild(s);
  // Remove after transition so it doesn't slow everything down
  setTimeout(() => s.remove(), 600);
}

/* ── Render theme picker grid ───────────────── */
function renderThemeGrid() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const categories = ['All', ...new Set(THEMES.map(t => t.category).filter(c => c !== 'All'))];

  // Category filter pills
  const filterRow = document.createElement('div');
  filterRow.style.cssText = `
    display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;
    grid-column:1/-1;
  `;
  let activeCat = 'All';
  const pills = [];

  categories.forEach(cat => {
    const pill = document.createElement('button');
    pill.textContent = cat;
    pill.style.cssText = `
      padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;
      border:1.5px solid var(--border);background:transparent;
      color:var(--text2);cursor:pointer;
      transition:all 0.15s ease;
    `;
    if (cat === 'All') {
      pill.style.background = 'var(--accent)';
      pill.style.color = 'var(--accent-text)';
      pill.style.borderColor = 'var(--accent)';
    }
    pill.addEventListener('click', () => {
      activeCat = cat;
      pills.forEach(p => {
        p.style.background = 'transparent';
        p.style.color = 'var(--text2)';
        p.style.borderColor = 'var(--border)';
      });
      pill.style.background = 'var(--accent)';
      pill.style.color = 'var(--accent-text)';
      pill.style.borderColor = 'var(--accent)';
      // Re-render cards filtered
      renderThemeCards(activeCat);
    });
    pills.push(pill);
    filterRow.appendChild(pill);
  });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'grid-column:1/-1;';
  wrapper.appendChild(filterRow);
  grid.appendChild(wrapper);

  renderThemeCards('All');
}

function renderThemeCards(filterCat) {
  // Remove existing cards, keep filter row
  const grid = document.getElementById('theme-grid');
  grid.querySelectorAll('.theme-item').forEach(el => el.remove());

  const filtered = filterCat === 'All' ? THEMES : THEMES.filter(t => t.category === filterCat || t.category === 'All');

  filtered.forEach((theme, i) => {
    const item = document.createElement('div');
    item.className = 'theme-item' + (theme.id === activeTheme ? ' active' : '');
    item.dataset.theme = theme.id;
    item.style.cssText = `
      border-radius:12px;overflow:hidden;cursor:pointer;
      border:2px solid ${theme.id === activeTheme ? 'var(--accent)' : 'transparent'};
      transition:border-color 0.2s ease, transform 0.15s ease;
      animation:themeCardIn 0.2s ease both;
      animation-delay:${i * 30}ms;
    `;

    // Inject card animation once
    if (!document.getElementById('theme-card-anim')) {
      const s = document.createElement('style');
      s.id = 'theme-card-anim';
      s.textContent = `
        @keyframes themeCardIn {
          from { opacity:0; transform:scale(0.9) translateY(6px); }
          to   { opacity:1; transform:none; }
        }
      `;
      document.head.appendChild(s);
    }

    // Preview bar (3-color gradient like Instagram theme bubbles)
    const preview = document.createElement('div');
    preview.style.cssText = `
      height:60px;
      background:linear-gradient(135deg,
        ${theme.colors[2]} 0%,
        ${theme.colors[1]} 50%,
        ${theme.colors[0]} 100%
      );
      display:flex;align-items:flex-end;padding:6px 8px;gap:4px;
    `;

    // Small mock UI dots
    [theme.colors[0], theme.colors[1]].forEach(c => {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width:8px;height:8px;border-radius:50%;background:${c};opacity:0.85;
      `;
      preview.appendChild(dot);
    });

    if (theme.id === activeTheme) {
      const check = document.createElement('div');
      check.innerHTML = '✓';
      check.style.cssText = `
        margin-left:auto;width:18px;height:18px;border-radius:50%;
        background:${theme.colors[0]};color:#fff;font-size:11px;
        display:flex;align-items:center;justify-content:center;font-weight:700;
      `;
      preview.appendChild(check);
    }

    const label = document.createElement('div');
    label.style.cssText = `
      padding:7px 8px;background:var(--surface2);border-top:1px solid var(--border);
    `;
    label.innerHTML = `
      <p style="font-size:12px;font-weight:700;color:var(--text)">${theme.emoji} ${theme.label}</p>
      <p style="font-size:10px;color:var(--text2);margin-top:1px">${theme.desc}</p>
    `;

    item.appendChild(preview);
    item.appendChild(label);

    // Hover preview
    item.addEventListener('mouseenter', () => {
      document.body.setAttribute('data-theme', theme.id);
    });
    item.addEventListener('mouseleave', () => {
      document.body.setAttribute('data-theme', activeTheme);
    });

    item.addEventListener('click', () => {
      applyTheme(theme.id);
      // Animate checkmark
      item.style.transform = 'scale(0.95)';
      setTimeout(() => item.style.transform = '', 150);
      // Close modal after short delay
      setTimeout(() => {
        closeThemeModal();
        showToast(`${theme.emoji} ${theme.label} applied!`);
      }, 300);
    });

    grid.appendChild(item);
  });
}

/* ── Load saved theme on startup ────────────── */
function loadSavedTheme() {
  const saved = localStorage.getItem('sw_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      if (user.theme) applyTheme(user.theme, false);
    } catch (e) {}
  } else {
    const lastTheme = localStorage.getItem('sw_last_theme');
    if (lastTheme) applyTheme(lastTheme, false);
  }
}

/* ── Keyboard shortcut: T to open theme picker */
document.addEventListener('keydown', (e) => {
  if (e.key === 't' && !e.target.closest('input, textarea')) {
    const modal = document.getElementById('theme-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeThemeModal();
    } else if (modal) {
      modal.classList.remove('hidden');
      renderThemeGrid();
    }
  }
});

/* ── Run immediately so theme loads before paint */
loadSavedTheme();
