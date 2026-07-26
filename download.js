// GET /api/download?url=https://video.twimg.com/...
//
// Streams the file so the response isn't buffered into memory or held to
// the 4.5MB payload limit that applies to non-streamed function responses
// on Vercel. Locked to video.twimg.com so this endpoint can't be used as
// an open proxy.

const { Readable } = require('stream');

module.exports = async (req, res) => {
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

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send('Download failed.');
  }
};
