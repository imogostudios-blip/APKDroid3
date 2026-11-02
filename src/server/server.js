const express = require('express');
const cors = require('cors');
const path = require('path');
const gplay = require('google-play-scraper').default;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from project root
app.use(express.static(path.join(__dirname, '../../')));

// Helper to map google-play-scraper app object to the iTunes-like shape the frontend expects
function mapApp(g) {
  if (!g) return null;
  const sizeBytes = parseSize(g.size);
  return {
    trackId: g.appId,
    trackName: g.title || g.appId,
    artistName: g.developer || '',
    artworkUrl100: g.icon || '',
    artworkUrl512: g.icon || '',
    artworkUrl60: g.icon || '',
    averageUserRating: g.score || 0,
    userRatingCount: g.ratings || 0,
    formattedPrice: g.priceText || (g.free ? 'Free' : ''),
    primaryGenreName: g.genre || '',
    primaryGenreId: g.genreId || '',
    fileSizeBytes: sizeBytes,
    screenshotUrls: Array.isArray(g.screenshots) ? g.screenshots : [],
    bundleId: g.appId,
    description: g.description || g.summary || '',
    version: g.version || '',
    currentVersionReleaseDate: g.updated || '',
    releaseDate: g.released || '',
    trackViewUrl: g.url || `https://play.google.com/store/apps/details?id=${encodeURIComponent(g.appId)}`,
    contentAdvisoryRating: g.contentRating || '',
    // extra fields that may be useful
    installs: g.installs || '',
    minInstalls: g.minInstalls || 0,
    developerEmail: g.developerEmail || '',
    developerWebsite: g.developerWebsite || '',
    recentChanges: g.recentChanges || '',
    headerImage: g.headerImage || '',
  };
}

function parseSize(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const m = sizeStr.match(/([\d.]+)\s*([KMG])?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'K') n *= 1024;
  else if (unit === 'M') n *= 1024 * 1024;
  else if (unit === 'G') n *= 1024 * 1024 * 1024;
  return Math.round(n);
}

function mapReview(r) {
  if (!r) return null;
  return {
    author: { name: { label: r.userName || 'User' } },
    title: { label: r.title || '' },
    content: { label: r.text || '' },
    'im:rating': { label: String(r.score || 0) },
    updated: { label: r.date || '' },
    // extra
    score: r.score,
    thumbsUp: r.thumbsUp || 0,
  };
}

// --- API endpoints ---

// Search apps
app.get('/api/search', async (req, res) => {
  try {
    const term = req.query.term || '';
    const num = Math.min(parseInt(req.query.limit || req.query.num || '25', 10) || 25, 100);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    if (!term) return res.json([]);
    const results = await gplay.search({ term, num, country, lang });
    res.json((results || []).map(mapApp).filter(Boolean));
  } catch (err) {
    console.error('search error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Lookup single app by package id
app.get('/api/lookup', async (req, res) => {
  try {
    const appId = req.query.id || req.query.appId;
    if (!appId) return res.json(null);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    const details = await gplay.app({ appId, country, lang });
    res.json(mapApp(details));
  } catch (err) {
    console.error('lookup error', err.message);
    res.json(null);
  }
});

// Top free apps
app.get('/api/top', async (req, res) => {
  try {
    const num = Math.min(parseInt(req.query.limit || req.query.num || '30', 10) || 30, 100);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    const results = await gplay.list({
      collection: gplay.collection.TOP_FREE,
      num,
      country,
      lang,
    });
    res.json((results || []).map(mapApp).filter(Boolean));
  } catch (err) {
    console.error('top error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Category / search by term (genreId ignored or used as hint)
app.get('/api/cat', async (req, res) => {
  try {
    const term = req.query.term || '';
    const num = Math.min(parseInt(req.query.limit || req.query.num || '20', 10) || 20, 100);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    // genreId from old iTunes is ignored; we just search by term
    if (!term) return res.json([]);
    const results = await gplay.search({ term, num, country, lang });
    res.json((results || []).map(mapApp).filter(Boolean));
  } catch (err) {
    console.error('cat error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const appId = req.query.id || req.query.appId;
    if (!appId) return res.json({ feed: { entry: [] } });
    const num = Math.min(parseInt(req.query.num || '50', 10) || 50, 200);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    const result = await gplay.reviews({ appId, num, country, lang, sort: gplay.sort.NEWEST });
    const entries = (result && result.data ? result.data : []).map(mapReview).filter(Boolean);
    // Shape similar to old iTunes RSS so frontend parsing still works if needed
    res.json({ feed: { entry: entries } });
  } catch (err) {
    console.error('reviews error', err.message);
    res.json({ feed: { entry: [] } });
  }
});

// Similar apps
app.get('/api/similar', async (req, res) => {
  try {
    const appId = req.query.id || req.query.appId;
    if (!appId) return res.json([]);
    const country = (req.query.country || 'us').toLowerCase();
    const lang = req.query.lang || 'en';
    const results = await gplay.similar({ appId, country, lang });
    res.json((results || []).map(mapApp).filter(Boolean));
  } catch (err) {
    console.error('similar error', err.message);
    res.json([]);
  }
});

// Optional: resolve a direct APK URL (still uses external sources because google-play-scraper does not provide APK binaries)
// The frontend can keep using its own resolver; this endpoint is provided for completeness.
app.get('/api/resolve-apk', async (req, res) => {
  // For now just return the Play Store page as a fallback; real APK resolution remains in the client
  // (or can be extended later with other scrapers)
  const appId = req.query.id || '';
  const name = req.query.name || '';
  res.json({
    url: appId ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}` : '',
    pkg: appId,
    title: name,
    note: 'Direct APK binaries are not provided by google-play-scraper. Use other store options or the existing client-side resolver.',
  });
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'google-play-scraper' });
});

// Fallback to index.html for SPA-like routing if needed
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, '../../index.html'));
});

app.listen(PORT, () => {
  console.log(`APKDroid server running on http://localhost:${PORT}`);
  console.log('Serving static files + google-play-scraper API');
});
