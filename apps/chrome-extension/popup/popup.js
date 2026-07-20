const BKMR_API = 'http://127.0.0.1:8733';

document.addEventListener('alpine:init', () => {
  Alpine.data('popupApp', () => ({
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
        ? '\u5904\u7406\u4e2d...'
        : (this.mode === 'update' ? '\u66f4\u65b0\u4e66\u7b7e' : '\u6dfb\u52a0\u4e66\u7b7e');
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
        const resp = await fetch(`${BKMR_API}/api/tags`);
        this.connected = resp.ok;
      } catch {
        this.connected = false;
      }
    },

    async fillFromCurrentTab() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        this.currentTab = tab;
        this.form.url = tab.url;
        this.form.title = tab.title || '';
      } catch {}
    },

    async fillDescriptionFromPage() {
      if (!this.currentTab?.id) return;
      try {
        const [result] = await chrome.scripting.executeScript({
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
      this.tagify = new Tagify(input, {
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
        const resp = await fetch(`${BKMR_API}/api/tags`);
        if (!resp.ok) return;
        const tags = await resp.json();
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

    async checkExistingBookmark() {
      const url = this.form.url;
      if (!url) return;
      this.showBanner = false;
      this.existingBookmark = null;
      this.mode = 'create';
      try {
        const resp = await fetch(
          `${BKMR_API}/api/bookmarks/check?url=${encodeURIComponent(url)}`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.exists && data.bookmark) {
          this.existingBookmark = data.bookmark;
          this.mode = 'update';
          const tags = data.bookmark.tags?.length
            ? data.bookmark.tags.join(', ') : '\u65e0\u6807\u7b7e';
          const desc = data.bookmark.description
            ? ` \u2014 ${data.bookmark.description}` : '';
          this.bannerText = '\u5df2\u6536\u85cf';
          this.showBanner = true;

          // Populate tags into Tagify
          this.setTags(data.bookmark.tags);
          // Populate description into form
          if (data.bookmark.description) {
            this.form.description = data.bookmark.description;
          }
        }
      } catch {}
    },

    async submit() {
      const url = this.form.url.trim();
      if (!url) { this.errorMessage = '\u8bf7\u8f93\u5165 URL'; return; }
      if (this.submitting) return;
      this.submitting = true;
      this.errorMessage = '';
      this.successMessage = '';
      const title = this.form.title.trim() || url;
      const tags = this.getTags();
      const description = this.form.description.trim();
      try {
        if (this.existingBookmark) {
          await this._updateBookmark(title, tags, description);
        } else {
          await this._createBookmark(url, title, tags, description);
        }
      } catch {
        this.errorMessage = '\u65e0\u6cd5\u8fde\u63a5\u5230 bkmrx\uff0c\u8bf7\u786e\u8ba4\u5e94\u7528\u5df2\u542f\u52a8';
      } finally {
        this.submitting = false;
      }
    },

    async _createBookmark(url, title, tags, description) {
      const resp = await fetch(`${BKMR_API}/api/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, tags }),
      });
      const data = await resp.json();
      if (resp.ok) {
        this.successMessage = `\u4e66\u7b7e\u5df2\u6dfb\u52a0 (ID: ${data.id})`;
        this.existingBookmark = { id: data.id, url, title, tags };
        const tagStr = tags.length ? tags.join(', ') : '\u65e0\u6807\u7b7e';
        const descStr = description ? ` \u2014 ${description}` : '';
        this.bannerText = '\u5df2\u6536\u85cf';
        this.showBanner = true;
        this.mode = 'update';
        await this.loadTagWhitelist();
      } else if (data.duplicate) {
        this.errorMessage = '\u8be5\u4e66\u7b7e\u5df2\u5b58\u5728\uff0c\u8bf7\u4f7f\u7528\u66f4\u65b0\u529f\u80fd';
        await this.checkExistingBookmark(url);
      } else {
        this.errorMessage = data.error || '\u6dfb\u52a0\u5931\u8d25';
      }
    },

    async _updateBookmark(title, tags, description) {
      const resp = await fetch(
        `${BKMR_API}/api/bookmarks/${this.existingBookmark.id}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, tags }) }
      );
      const data = await resp.json();
      if (resp.ok) {
        this.successMessage = `\u4e66\u7b7e\u5df2\u66f4\u65b0 (ID: ${this.existingBookmark.id})`;
        this.existingBookmark.title = title;
        this.existingBookmark.tags = tags;
        const tagStr = tags.length ? tags.join(', ') : '\u65e0\u6807\u7b7e';
        const descStr = description ? ` \u2014 ${description}` : '';
        this.bannerText = '\u5df2\u6536\u85cf';
      } else {
        this.errorMessage = data.error || '\u66f4\u65b0\u5931\u8d25';
      }
    },
  }));
});
