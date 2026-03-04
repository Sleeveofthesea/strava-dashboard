const express = require('express');
const axios = require('axios');
const router = express.Router();

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REDIRECT_URI,
} = process.env;

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

// Scopes needed: read activity data
const SCOPES = 'read,activity:read_all';

// ─── GET /auth/login ──────────────────────────────────────────────────────────
// Redirect user to Strava's OAuth consent screen
router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPES,
  });
  res.redirect(`${STRAVA_AUTH_URL}?${params}`);
});

// ─── GET /auth/callback ───────────────────────────────────────────────────────
// Strava redirects here after user approves access
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=access_denied');
  }

  try {
    const { data } = await axios.post(STRAVA_TOKEN_URL, {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    // Persist tokens and athlete info in the session
    req.session.athlete = data.athlete;
    req.session.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at, // Unix timestamp (seconds)
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth token exchange failed:', err.response?.data || err.message);
    res.redirect('/?error=token_exchange_failed');
  }
});

// ─── GET /auth/logout ─────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ─── GET /auth/status ─────────────────────────────────────────────────────────
// Used by the frontend to check login state without a page reload
router.get('/status', (req, res) => {
  if (req.session.athlete) {
    res.json({ loggedIn: true, athlete: req.session.athlete });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;
