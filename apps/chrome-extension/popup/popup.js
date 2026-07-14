const BKMR_API = 'http://127.0.0.1:8733';

// --- DOM refs ---
const form = document.getElementById('bookmark-form');
const urlInput = document.getElementById('url');
const titleInput = document.getElementById('title');
const tagsInput = document.getElementById('tags');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const existingBanner = document.getElementById('existing-banner');
const existingInfo = document.getElementById('existing-info');
const descInput = document.getElementById("description");

// --- State ---
let currentTab = null;
let existingBookmark = null;  // { id, title, tags } if URL already bookmarked
let tagify = null;            // Tagify instance

// --- Auto-fill from current tab ---
async function fillFromCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  currentTab = tab;
  urlInput.value = tab.url;
  titleInput.value = tab.title || '';
}

// --- Auto-fill description from page meta tags ---
async function fillDescriptionFromPage() {
  if (!currentTab?.id) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        const meta = document.querySelector('meta[property="og:description"]')
          || document.querySelector('meta[name="description"]')
          || document.querySelector('meta[property="twitter:description"]');
        return meta ? meta.getAttribute('content').trim() : '';
      },
    });
    const desc = result?.result;
    if (desc && descInput) {
      descInput.value = desc;
    }
  } catch {
    // scripting not available — silently skip
  }
}

// --- Check if current URL is already bookmarked ---
async function checkExistingBookmark(url) {
  if (!url) return;

  existingBanner.hidden = true;
  existingBookmark = null;
  resetSubmitButton();

  try {
    const resp = await fetch(`${BKMR_API}/api/bookmarks/check?url=${encodeURIComponent(url)}`);
    if (!resp.ok) return;
    const data = await resp.json();

    if (data.exists && data.bookmark) {
      existingBookmark = data.bookmark;

      // Show banner
      const tags = existingBookmark.tags && existingBookmark.tags.length
        ? existingBookmark.tags.join(', ')
        : '无标签';
      const existingDesc = existingBookmark.description ? ` — ${existingBookmark.description}` : '';
      existingInfo.textContent = `已收藏 — ${existingBookmark.title} (ID: ${existingBookmark.id}) · ${tags}${existingDesc}`;
      existingBanner.hidden = false;

      // Switch button to update mode
      submitBtn.querySelector('.btn-text').textContent = '更新书签';
      submitBtn.classList.add('update-mode');
    }
  } catch {
    // bkmr-desktop not running — ignore
  }
}

// --- Load all tags from server as Tagify whitelist ---
async function loadAllTags() {
  try {
    const resp = await fetch(`${BKMR_API}/api/tags`);
    if (!resp.ok) return [];
    const tags = await resp.json();
    if (!Array.isArray(tags)) return [];
    return tags.map(t => t.name);
  } catch {
    return [];
  }
}

function resetSubmitButton() {
  submitBtn.querySelector('.btn-text').textContent = '添加书签';
  submitBtn.classList.remove('update-mode');
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
  const tags = tagify ? tagify.value.map(t => t.value) : [];
  const description = descInput ? descInput.value.trim() : '';

  // Submit
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  hideStatus();

  try {
    if (existingBookmark) {
      // --- Update mode ---
      const resp = await fetch(`${BKMR_API}/api/bookmarks/${existingBookmark.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, tags }),
      });

      const data = await resp.json();

      if (resp.ok) {
        showStatus(`书签已更新 (ID: ${existingBookmark.id})`, 'success');
        // Refresh banner with new info
        existingBookmark.title = title;
        existingBookmark.tags = tags;
        const tagStr = tags.length ? tags.join(', ') : '无标签';
        const desc = description || existingBookmark.description || '';
      const descStr = desc ? ` — ${desc}` : '';
      existingInfo.textContent = `已收藏 — ${existingBookmark.title} (ID: ${existingBookmark.id}) · ${tagStr}${descStr}`;
      } else {
        showStatus(data.error || '更新失败', 'error');
      }
    } else {
      // --- Create mode ---
      const resp = await fetch(`${BKMR_API}/api/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, tags }),
      });

      const data = await resp.json();

      if (resp.ok) {
        showStatus(`书签已添加 (ID: ${data.id})`, 'success');
        // After successful add, show the "already exists" state
        existingBookmark = { id: data.id, url, title, tags };
        const tagStr = tags.length ? tags.join(', ') : '无标签';
        const descStr = description ? ` — ${description}` : '';
      existingInfo.textContent = `已收藏 — ${title} (ID: ${data.id}) · ${tagStr}${descStr}`;
        existingBanner.hidden = false;
        submitBtn.querySelector('.btn-text').textContent = '更新书签';
        submitBtn.classList.add('update-mode');

        // Refresh Tagify whitelist in case new tags were created
        const allTags = await loadAllTags();
        tagify.settings.whitelist = allTags;
        tagify.dropdown.rebuild();
      } else if (data.duplicate) {
        showStatus('该书签已存在，请使用更新功能', 'info');
        await checkExistingBookmark(url);
      } else {
        showStatus(data.error || '添加失败', 'error');
      }
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
(async function init() {
  await fillFromCurrentTab();
  await fillDescriptionFromPage();

  // Load all existing tags and init Tagify
  const allTags = await loadAllTags();
  tagify = new Tagify(tagsInput, {
    whitelist: allTags,
    enforceWhitelist: false,
    delimiters: ',',
    maxTags: 50,
    focusable: false,
    dropdown: {
      enabled: 0,
      maxItems: 20,
      closeOnSelect: false,
      classname: 'tags-look',
    },
  });

  // After auto-fill, check if this URL already exists
  await checkExistingBookmark(urlInput.value);
})();
