const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'stats.json');

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { total_users: 0, total_graphs: 0, daily: {} };
}

function saveData(data) {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getStats() {
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];
  return {
    total_users: data.total_users,
    total_graphs: data.total_graphs,
    daily_active: data.daily[today] || 0
  };
}

function incrementUsers() {
  const data = loadData();
  data.total_users += 1;
  saveData(data);
}

function incrementGraphs() {
  const data = loadData();
  data.total_graphs += 1;
  const today = new Date().toISOString().split('T')[0];
  data.daily[today] = (data.daily[today] || 0) + 1;
  saveData(data);
}

module.exports = { getStats, incrementUsers, incrementGraphs };
