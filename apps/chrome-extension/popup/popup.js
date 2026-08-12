const BKMRX_API = 'http://127.0.0.1:8733';

async function parseApiResponse(response) {
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || '请求失败');
  }
  return body;
}

function createPopupApp({ fetchImpl, chromeApi, TagifyCtor }) {
  return {
    checkingConnection: true,
    connected: false,

    form: { url: '', title: '', description: '' },

    mode: 'create',
    submitting: false,
    errorMessage: '',
    successMessage: '',

    showBanner: false,
    bannerText: '',

    existingBookmark: null,
    currentTab: null,
    tagify: null,

    // --- Computed view states ---
    get isDisconnected() {
      return !this.checkingConnection && !this.connected;
    },
    get isConnected() {
      return !this.checkingConnection && this.connected;
    },
    get submitBtnClass() {
      return { 'update-mode': this.mode === 'update', loading: this.submitting };
    },
    get buttonText() {
      return this.submitting
        ? '处理中...'
        : (this.mode === 'update' ? '更新书签' : '添加书签');
    },

    async init() {
      await this.checkConnection();
      this.checkingConnection = false;
    },

    async onConnected() {
      await this.fillFromCurrentTab();
      await this.fillDescriptionFromPage();
      this.$nextTick(() => {
        this.initTagify();
        this.checkExistingBookmark();
      });
    },

    async checkConnection() {
      try {
        const response = await fetchImpl(`${BKMRX_API}/api/health`);
        await parseApiResponse(response);
        this.connected = true;
      } catch {
        this.connected = false;
      }
    },

    async fillFromCurrentTab() {
      try {
        const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        this.currentTab = tab;
        this.form.url = tab.url;
        this.form.title = tab.title || '';
      } catch {}
    },

    async fillDescriptionFromPage() {
      if (!this.currentTab?.id) return;
      try {
        const [result] = await chromeApi.scripting.executeScript({
          target: { tabId: this.currentTab.id },
          func: () => {
            const meta =
              document.querySelector('meta[property="og:description"]') ||
              document.querySelector('meta[name="description"]') ||
              document.querySelector('meta[property="twitter:description"]');
            return meta ? meta.getAttribute('content').trim() : '';
          },
        });
        const desc = result?.result;
        if (desc) this.form.description = desc;
      } catch {}
    },

    initTagify() {
      const input = this.$refs.tagsInput;
      if (!input || this.tagify) return;
      this.tagify = new TagifyCtor(input, {
        whitelist: [],
        enforceWhitelist: false,
        delimiters: ',',
        maxTags: 50,
        focusable: false,
        dropdown: {
          enabled: 0, maxItems: 20, closeOnSelect: false, classname: 'tags-look',
        },
      });
      this.loadTagWhitelist();
    },

    async loadTagWhitelist() {
      try {
        const response = await fetchImpl(`${BKMRX_API}/api/tags`);
        const tags = await parseApiResponse(response);
        if (Array.isArray(tags)) {
          this.tagify.settings.whitelist = tags.map(t => t.name);
          this.tagify.dropdown.rebuild();
        }
      } catch {}
    },

    getTags() {
      return this.tagify ? this.tagify.value.map(t => t.value) : [];
    },

    setTags(tags) {
      if (!this.tagify) return;
      this.tagify.removeAllTags();
      if (Array.isArray(tags) && tags.length) {
        this.tagify.addTags(tags);
      }
    },

    setExistingBookmark(bookmark) {
      this.existingBookmark = bookmark;
      this.mode = 'update';
      this.bannerText = '已收藏';
      this.showBanner = true;
      this.form.url = bookmark.url;
      this.form.title = bookmark.title;
      this.form.description = bookmark.description || '';
      this.setTags(bookmark.tags);
    },

    async checkExistingBookmark() {
      const url = this.form.url;
      if (!url) return;
      this.showBanner = false;
      this.existingBookmark = null;
      this.mode = 'create';
      try {
        const response = await fetchImpl(
          `${BKMRX_API}/api/bookmarks/by-url?url=${encodeURIComponent(url)}`
        );
        if (response.status === 404) return;
        const bookmark = await parseApiResponse(response);
        if (bookmark) {
          this.setExistingBookmark(bookmark);
        }
      } catch {}
    },

    async submit() {
      const url = this.form.url.trim();
      if (!url) { this.errorMessage = '请输入 URL'; return; }
      if (this.submitting) return;
      this.submitting = true;
      this.errorMessage = '';
      this.successMessage = '';
      const title = this.form.title.trim() || url;
      const tags = this.getTags();
      // Read the live textarea value. With Alpine's CSP build, the nested
      // x-model state can still contain the page's original description here.
      const description = (this.$refs.descriptionInput?.value ?? this.form.description).trim();
      try {
        if (this.existingBookmark) {
          await this._updateBookmark(url, title, tags, description);
        } else {
          await this._createBookmark(url, title, tags, description);
        }
      } catch (error) {
        this.errorMessage = error instanceof Error
          ? error.message
          : '无法连接到 bkmrx，请确认应用已启动';
      } finally {
        this.submitting = false;
      }
    },

    async _createBookmark(url, title, tags, description) {
      const response = await fetchImpl(`${BKMRX_API}/api/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, tags, description }),
      });
      const bookmark = await parseApiResponse(response);
      this.successMessage = `书签已添加 (ID: ${bookmark.id})`;
      this.setExistingBookmark(bookmark);
      await this.loadTagWhitelist();
    },

    async _updateBookmark(url, title, tags, description) {
      const response = await fetchImpl(
        `${BKMRX_API}/api/bookmarks/${this.existingBookmark.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, title, tags, description }) }
      );
      const bookmark = await parseApiResponse(response);
      this.successMessage = `书签已更新 (ID: ${bookmark.id})`;
      this.setExistingBookmark(bookmark);
    },
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('alpine:init', () => {
    Alpine.data('popupApp', () => createPopupApp({
      fetchImpl: fetch,
      chromeApi: chrome,
      TagifyCtor: Tagify,
    }));
  });
}

if (typeof module !== 'undefined') {
  module.exports = { BKMRX_API, createPopupApp, parseApiResponse };
}
