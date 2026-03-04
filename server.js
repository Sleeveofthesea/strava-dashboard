require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // required for secure cookies behind Railway/Render proxy

// Session store — persists across restarts using SQLite
const SQLiteStore = require('connect-sqlite3')(session);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: './sessions' }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: send index.html for any unmatched route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure sessions directory exists before starting
const fs = require('fs');
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

app.listen(PORT, () => {
  console.log(`Strava Dashboard running at http://localhost:${PORT}`);
  console.log(`OAuth callback: ${process.env.STRAVA_REDIRECT_URI}`);
});
