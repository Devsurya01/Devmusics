const express = require('express');
const cors = require('cors');
const path    = require('path');
const routes  = require('./routes');

const app  = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['https://devmusics-1.onrender.com', 'http://localhost:3000', 'http://localhost:5000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));
app.use(express.json({ limit: '1mb' }));

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve assets (logo, songs)
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// All API calls go through /api
app.use('/api', routes);

// Any other route → send index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(port, () => {
  console.log(`✅ SoundWave running on port ${port}`);
});
