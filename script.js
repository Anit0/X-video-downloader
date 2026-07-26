const form = document.getElementById('pullerForm');
const input = document.getElementById('tweetUrl');
const pasteBtn = document.getElementById('pasteBtn');
const pullBtn = document.getElementById('pullBtn');
const hint = document.getElementById('formHint');
const resultsSection = document.getElementById('results');
const resultCard = document.getElementById('resultCard');

// Point this at wherever server.js is running. Same origin works if you
// serve this file from the Express app itself (see server.js).
const API_BASE = '';

const TWEET_URL_RE = /(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i;

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    input.value = text.trim();
    input.focus();
  } catch (err) {
    setHint('Your browser blocked clipboard access — paste manually with Ctrl/Cmd+V.', true);
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  const match = url.match(TWEET_URL_RE);

  if (!match) {
    setHint('That doesn\u2019t look like a post link. It should look like x.com/username/status/1234567890', true);
    return;
  }

  const tweetId = match[2];
  setHint('Works with x.com and twitter.com links that contain a video or GIF.', false);
  setLoading(true);
  resultsSection.hidden = true;

  try {
    const res = await fetch(`${API_BASE}/api/resolve?id=${tweetId}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      renderError(data.error || 'Couldn\u2019t read that post. It may be private, deleted, or carry no video.');
      return;
    }

    renderResult(data);
  } catch (err) {
    renderError('Couldn\u2019t reach the lookup service. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  pullBtn.disabled = isLoading;
  pullBtn.classList.toggle('loading', isLoading);
  pullBtn.querySelector('.pull-btn-label').textContent = isLoading ? 'Pulling\u2026' : 'Pull video';
}

function setHint(text, isError) {
  hint.textContent = text;
  hint.classList.toggle('error', !!isError);
}

function renderError(message) {
  resultsSection.hidden = false;
  resultCard.innerHTML = `<p class="result-error">${escapeHtml(message)}</p>`;
}

function renderResult(data) {
  resultsSection.hidden = false;

  const renditions = [...data.variants]
    .filter(v => v.contentType === 'video/mp4')
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const rows = renditions.map(v => {
    const label = v.quality || (v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : 'MP4');
    const downloadHref = `${API_BASE}/api/download?url=${encodeURIComponent(v.url)}`;
    return `
      <div class="rendition-row">
        <span class="rendition-meta">${escapeHtml(label)}<small>${escapeHtml(v.url)}</small></span>
        <a href="${downloadHref}" download>Download</a>
      </div>`;
  }).join('');

  resultCard.innerHTML = `
    <div class="result-head">
      <h4>media found</h4>
      <span class="result-author">${escapeHtml(data.author || '')}</span>
    </div>
    <video class="result-video" src="${escapeHtml(data.preview || renditions[0]?.url || '')}" controls playsinline></video>
    <div class="rendition-list">${rows || '<p class="result-error">No MP4 renditions on this post.</p>'}</div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}
