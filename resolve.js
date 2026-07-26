// GET /api/resolve?id=1234567890
//
// Same logic as the Express version, reshaped as a Vercel serverless
// function (a single default-exported handler instead of an app.get route).

function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function guessQuality(url) {
  const match = url.match(/\/(\d{3,4})x(\d{3,4})\//);
  return match ? `${match[2]}p` : null;
}

module.exports = async (req, res) => {
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

    return res.status(200).json({
      ok: true,
      author: tweet.user ? `@${tweet.user.screen_name}` : null,
      preview: videoMedia.video_info?.variants?.[0]?.url || null,
      variants
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Lookup failed. Try again in a moment.' });
  }
};
