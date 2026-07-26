# Anit0 Pullwire

A small tool that saves the video or GIF file attached to a public X (Twitter) post — paste a link, get the direct MP4.

## What's in here

- `index.html`, `style.css`, `script.js` — the front end (the page people paste a link into).
- `server.js` — a small Express backend. This is the part that actually finds the video file; a browser can't do this alone (X's data isn't reachable directly from front-end JavaScript due to CORS, and the lookup needs a small amount of server-side logic).
- `package.json` — backend dependencies.

## Running it locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`. The Express server serves the front end *and* the `/api/resolve` endpoint it calls, so everything runs from one process.

## How the lookup works

`server.js` calls Twitter/X's public **syndication endpoint** — the same read-only JSON feed that powers embedded tweets on other websites (the thing that renders when a tweet is embedded in a blog post). It:

1. Takes the numeric post ID out of the pasted URL.
2. Requests `https://cdn.syndication.twimg.com/tweet-result?id=...` for that post's public data.
3. Reads the `video_info.variants` list already present in that response — these are direct links to `video.twimg.com`, X's own CDN.
4. Returns that list to the front end, which lets the person pick a resolution and download straight from `video.twimg.com`. The server never downloads, stores, or re-hosts the file itself.

Because this only touches data already served to logged-out visitors, no API key or login is required. The trade-off is that it's an undocumented endpoint: X can change or restrict it without notice, which would break the lookup until it's updated.

## Things worth knowing before you ship this publicly

- **Terms of service.** X's terms restrict scraping and automated data collection. This endpoint is what embeds use, but building a public downloader on top of it is still a gray area — plenty of sites do it (that's the model this project is based on), but it isn't something X has blessed, and they could block the endpoint or send a takedown at any time.
- **Private/removed posts** won't resolve, since the endpoint only ever returns what's publicly visible.
- **No storage.** Consider keeping it that way — not caching or re-hosting video keeps you firmly in "linking to a public file" territory rather than "hosting copyrighted media."
- **Rate limiting.** If this gets real traffic, put a rate limiter (e.g. `express-rate-limit`) in front of `/api/resolve` so one visitor can't hammer the syndication endpoint and get your server's IP blocked.
