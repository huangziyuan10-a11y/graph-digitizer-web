const express = require('express');
const path = require('path');
const fs = require('fs');
const { getStats, incrementUsers, incrementGraphs } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get usage stats
app.get('/api/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (err) {
    res.json({ total_users: 0, total_graphs: 0, daily_active: 0 });
  }
});

// API: Record new user visit
app.post('/api/stats/visit', (req, res) => {
  try {
    incrementUsers();
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

// API: Record graph processed
app.post('/api/stats/graph', (req, res) => {
  try {
    incrementGraphs();
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

// Serve the app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nGraph Digitizer is running!`);
  console.log(`Open in browser: http://localhost:${PORT}\n`);
});
