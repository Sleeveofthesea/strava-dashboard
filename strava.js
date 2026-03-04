/**
 * strava.js — Strava API client
 *
 * Handles:
 *  - Automatic token refresh (Strava tokens expire after 6 hours)
 *  - Full activity history via paginated fetching
 *  - Unit conversion (meters → miles, meters → feet, seconds → hours)
 *  - Activity type → sport key mapping
 */

const axios = require('axios');

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// ─── Unit conversions ─────────────────────────────────────────────────────────
const metersToMiles = (m) => +(m / 1609.344).toFixed(3);
const metersToFeet = (m) => +(m * 3.28084).toFixed(1);
const secondsToHours = (s) => +(s / 3600).toFixed(4);

// ─── Activity type → sport key ────────────────────────────────────────────────
// workout_type field values (from Strava docs):
//   0 = default run, 1 = race, 2 = long run, 3 = workout, 11 = trail run
const mapActivityType = (activity) => {
  const type = activity.sport_type || activity.type; // sport_type is newer API field
  const workoutType = activity.workout_type;

  switch (type) {
    case 'Run':
    case 'VirtualRun':
      return workoutType === 11 ? 'trail_run' : 'road_run';

    case 'TrailRun':
      return 'trail_run';

    case 'Hike':
    case 'Walk':
      return 'hike';

    case 'Ride':
    case 'VirtualRide':
    case 'EBikeRide':
      // Strava sets gear_id or name hints for MTB; use name heuristic if needed
      return 'road_bike';

    case 'MountainBikeRide':
    case 'GravelRide':
      return 'mtb';

    case 'BackcountrySki':
      return 'ski';

    case 'AlpineSki':
    case 'Snowboard':
      return 'alpine_ski'; // downhill/resort skiing — excluded from this app

    case 'NordicSki':
      return 'nordic';

    case 'RockClimbing':
      return 'outdoor_climb';

    case 'Workout':
    case 'WeightTraining':
    case 'Crossfit':
      return 'indoor_climb';

    default:
      return type.toLowerCase().replace(/\s+/g, '_');
  }
};

// ─── Token refresh ────────────────────────────────────────────────────────────
async function refreshIfNeeded(session) {
  const { tokens } = session;
  const nowSec = Math.floor(Date.now() / 1000);

  // Refresh if the token expires within the next 5 minutes
  if (tokens.expires_at - nowSec > 300) {
    return tokens.access_token;
  }

  const { data } = await axios.post(STRAVA_TOKEN_URL, {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });

  // Update session in-place (express-session will persist it)
  session.tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };

  return data.access_token;
}

// ─── Paginated activity fetch ─────────────────────────────────────────────────
async function fetchAllActivities(session) {
  const token = await refreshIfNeeded(session);
  const activities = [];
  let page = 1;
  const perPage = 200; // Strava max per page

  while (true) {
    const { data } = await axios.get(`${STRAVA_API_BASE}/athlete/activities`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { per_page: perPage, page },
    });

    if (!data || data.length === 0) break;

    activities.push(...data);
    if (data.length < perPage) break; // last page
    page++;
  }

  return activities;
}

// ─── Transform a single Strava activity into dashboard format ─────────────────
function transformActivity(activity) {
  // Determine week start (Monday) for the activity date
  const date = new Date(activity.start_date_local);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = (dayOfWeek + 6) % 7; // Mon=0 … Sun=6
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);

  return {
    id: activity.id,
    name: activity.name,
    sport: mapActivityType(activity),
    date: activity.start_date_local,          // ISO string, local time
    week: weekStart.toISOString().slice(0, 10), // "YYYY-MM-DD" of that Monday
    distance_miles: metersToMiles(activity.distance || 0),
    elevation_feet: metersToFeet(activity.total_elevation_gain || 0),
    duration_hours: secondsToHours(activity.moving_time || 0),
    // Extra fields that may be useful for the frontend
    average_speed_mph: activity.average_speed
      ? +(activity.average_speed * 2.23694).toFixed(2)
      : null,
    suffer_score: activity.suffer_score ?? null,
    kudos: activity.kudos_count ?? 0,
    pr_count: activity.pr_count ?? 0,
  };
}

module.exports = { fetchAllActivities, transformActivity };
