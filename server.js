// Pullwire backend
//
// This resolves a public post ID to its video/GIF MP4 renditions using
// Twitter/X's public syndication endpoint — the same read-only, no-login
// JSON feed that powers embedded tweets across the web. It only reads
// data already exposed to logged-out visitors; it does not touch any
// authenticated API and it never stores or re-hosts the video files
// themselves — clients download straight from video.twimg.com.
//
// Requires Node 18+ (for global fetch). Run: npm install && npm start

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(__dirname)); // serves index.html, style.css, script.js

const PORT = process.env.PORT || 3000;

// The syndication endpoint wants a "token" derived from the tweet id.
// This mirrors the same derivation the public widgets.js embed script uses.
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

app.get('/api/resolve', async (req, res) => {
  const id = (req.query.id || '').toString();

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid post id.' });
  }

  try {
    const token = syndicationToken(id);
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`;

    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PullwireBot/1.0)' }
    });

    if (!upstream.ok) {
      return res.status(404).json({ ok: false, error: 'Post not found, private, or removed.' });
    }

    const tweet = await upstream.json();

    const media =
      tweet?.mediaDetails ||
      tweet?.extended_entities?.media ||
      [];

    const videoMedia = media.find(m => m.type === 'video' || m.type === 'animated_gif');

    if (!videoMedia) {
      return res.status(422).json({ ok: false, error: 'This post has no video or GIF attached.' });
    }

    const variants = (videoMedia.video_info?.variants || [])
      .filter(v => v.content_type === 'video/mp4')
      .map(v => ({
        url: v.url,
        bitrate: v.bitrate || 0,
        contentType: v.content_type,
        quality: guessQuality(v.url)
      }));

    return res.json({
      ok: true,
      author: tweet.user ? `@${tweet.user.screen_name}` : null,
      preview: videoMedia.video_info?.variants?.[0]?.url || null,
      variants
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Lookup failed. Try again in a moment.' });
  }
});

function guessQuality(url) {
  const match = url.match(/\/(\d{3,4})x(\d{3,4})\//);
  return match ? `${match[2]}p` : null;
}

// Streams the CDN file back through our own origin so the browser's
// "download" attribute actually works (cross-origin downloads get
// silently turned into navigation by most browsers) and so the request
// never leaves the video's own referer requirements up to the visitor's
// browser. Locked to video.twimg.com so this can't be used as an open proxy.
app.get('/api/download', async (req, res) => {
  const target = (req.query.url || '').toString();

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).send('Invalid url.');
  }

  if (parsed.hostname !== 'video.twimg.com') {
    return res.status(400).send('Only video.twimg.com URLs are allowed.');
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PullwireBot/1.0)' }
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send('Could not fetch the video file.');
    }

    const filename = parsed.pathname.split('/').pop() || 'video.mp4';
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    upstream.body.pipeTo(new WritableStream({
      write(chunk) { res.write(chunk); },
      close() { res.end(); },
      abort(err) { res.end(); console.error('Stream aborted:', err); }
    }));
  } catch (err) {
    console.error(err);
    res.status(500).send('Download failed.');
  }
});


app.listen(PORT, () => {
  console.log(`Pullwire running at http://localhost:${PORT}`);
});
