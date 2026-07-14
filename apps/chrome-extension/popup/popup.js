const BKMR_API = 'http://127.0.0.1:8733';

// --- DOM refs ---
const form = document.getElementById('bookmark-form');
const urlInput = document.getElementById('url');
const titleInput = document.getElementById('title');
const tagsInput = document.getElementById('tags');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const suggestionsEl = document.getElementById('tag-suggestions');

// --- Auto-fill from current tab ---
async function fillFromCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  urlInput.value = tab.url;
  titleInput.value = tab.title || '';
}

// --- Tag suggestions ---
async function loadTagSuggestions() {
  try {
    const resp = await fetch(`${BKMR_API}/api/tags`);
    if (!resp.ok) return;
    const tags = await resp.json();
    if (!Array.isArray(tags) || tags.length === 0) return;

    const label = document.createElement('span');
    label.className = 'tag-suggest-label';
    label.textContent = '已存标签（点击添加）';
    suggestionsEl.appendChild(label);

    // Show top 30 most-used tags
    const topTags = tags
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 30);

    topTags.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${t.name}<span class="tag-count">${t.count || 0}</span>`;
      chip.addEventListener('click', () => addTag(t.name));
      suggestionsEl.appendChild(chip);
    });
  } catch {
    // bkmr-desktop not running — silently skip
  }
}

function addTag(tag) {
  const existing = tagsInput.value.trim();
  const tagList = existing ? existing.split(/\s+/) : [];
  if (!tagList.includes(tag)) {
    tagList.push(tag);
  }
  tagsInput.value = tagList.join(' ');
  tagsInput.focus();
}

// --- Submit ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validate
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('请输入 URL', 'error');
    return;
  }

  const title = titleInput.value.trim() || url;
  const rawTags = tagsInput.value.trim();
  const tags = rawTags ? rawTags.split(/\s+/).filter(Boolean) : [];

  // Submit
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  hideStatus();

  try {
    const resp = await fetch(`${BKMR_API}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, tags }),
    });

    const data = await resp.json();

    if (resp.ok) {
      showStatus(`书签已添加 (ID: ${data.id})`, 'success');
      urlInput.value = '';
      titleInput.value = '';
      tagsInput.value = '';
    } else {
      showStatus(data.error || '添加失败', 'error');
    }
  } catch (err) {
    showStatus(
      '无法连接到 bkmr-desktop，请确认应用已启动',
      'info'
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
});

// --- Status helpers ---
function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
  statusEl.className = 'status';
}

// --- Init ---
fillFromCurrentTab();
loadTagSuggestions();
