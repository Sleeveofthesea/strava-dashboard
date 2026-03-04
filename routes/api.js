const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { fetchAllActivities, transformActivity } = require('../strava');

const router = express.Router();

// In-memory cache per session to avoid hammering the Strava API on refresh
// Key: athlete id,  Value: { cachedAt: Date, activities: [] }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── GET /api/data ────────────────────────────────────────────────────────────
// Returns transformed activity history.
// Query params:
//   ?refresh=true   — force bypass of cache
router.get('/data', requireAuth, async (req, res) => {
  const athleteId = req.session.athlete?.id;
  const forceRefresh = req.query.refresh === 'true';

  // Serve from cache if fresh
  if (!forceRefresh && cache[athleteId]) {
    const age = Date.now() - cache[athleteId].cachedAt;
    if (age < CACHE_TTL_MS) {
      return res.json({
        cached: true,
        activities: cache[athleteId].activities,
      });
    }
  }

  try {
    const raw = await fetchAllActivities(req.session);
    const activities = raw.map(transformActivity);

    cache[athleteId] = { cachedAt: Date.now(), activities };

    res.json({ cached: false, activities });
  } catch (err) {
    console.error('/api/data error:', err.response?.data || err.message);

    // If Strava returns 401 our refresh failed — clear session
    if (err.response?.status === 401) {
      req.session.destroy();
      return res.status(401).json({ error: 'Strava token invalid. Please log in again.', loginUrl: '/auth/login' });
    }

    res.status(502).json({ error: 'Failed to fetch Strava data', detail: err.message });
  }
});

// ─── GET /api/me ─────────────────────────────────────────────────────────────
// Returns basic athlete profile stored in session (no extra API call needed)
router.get('/me', requireAuth, (req, res) => {
  res.json(req.session.athlete);
});

module.exports = router;
