const assert = require('node:assert/strict');
const test = require('node:test');

const { BKMRX_API, createPopupApp, parseApiResponse } = require('./popup.js');

function jsonResponse(body, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    status,
    ok,
    async json() {
      return body;
    },
  };
}

function bookmark(overrides = {}) {
  return {
    id: 42,
    url: 'https://example.com/',
    title: 'Saved title',
    description: 'Saved description',
    tags: ['saved-tag'],
    ...overrides,
  };
}

function createTestApp(responses = []) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response;
  };
  const app = createPopupApp({
    fetchImpl,
    chromeApi: {
      tabs: { query: async () => [] },
      scripting: { executeScript: async () => [] },
    },
    TagifyCtor: class {},
  });
  app.$refs = { descriptionInput: { value: '' } };
  app.$nextTick = callback => callback();
  return { app, requests };
}

test('parseApiResponse returns JSON bodies and handles 204 responses', async () => {
  assert.deepEqual(await parseApiResponse(jsonResponse({ status: 'ok' })), { status: 'ok' });
  assert.equal(await parseApiResponse({ status: 204 }), null);
});

test('parseApiResponse exposes API error messages', async () => {
  await assert.rejects(
    parseApiResponse(jsonResponse(
      { error: { message: 'Bookmark conflict' } },
      { status: 409, ok: false },
    )),
    /Bookmark conflict/,
  );
});

test('checkConnection reflects API availability', async () => {
  const connected = createTestApp([jsonResponse({ status: 'ok' })]).app;
  await connected.checkConnection();
  assert.equal(connected.connected, true);

  const disconnected = createTestApp([new Error('offline')]).app;
  await disconnected.checkConnection();
  assert.equal(disconnected.connected, false);
});

test('existing bookmark replaces all editable saved fields', async () => {
  const saved = bookmark({ description: '', tags: ['one', 'two'] });
  const { app } = createTestApp([jsonResponse(saved)]);
  const tagChanges = [];
  app.form = {
    url: 'https://example.com',
    title: 'Current page title',
    description: 'Current page description',
  };
  app.tagify = {
    removeAllTags() { tagChanges.push('remove'); },
    addTags(tags) { tagChanges.push(tags); },
  };

  await app.checkExistingBookmark();

  assert.deepEqual(app.form, {
    url: saved.url,
    title: saved.title,
    description: '',
  });
  assert.deepEqual(tagChanges, ['remove', ['one', 'two']]);
  assert.equal(app.existingBookmark, saved);
  assert.equal(app.mode, 'update');
  assert.equal(app.showBanner, true);
});

test('missing bookmark keeps the popup in create mode', async () => {
  const { app } = createTestApp([jsonResponse({}, { status: 404, ok: false })]);
  app.form.url = 'https://new.example';
  app.existingBookmark = bookmark();
  app.mode = 'update';

  await app.checkExistingBookmark();

  assert.equal(app.existingBookmark, null);
  assert.equal(app.mode, 'create');
  assert.equal(app.showBanner, false);
});

test('updating by id persists an edited URL and preserves the saved title', async () => {
  const saved = bookmark({ title: 'User customized title' });
  const updated = bookmark({
    url: 'https://example.com/updated',
    title: saved.title,
    description: '中文描述',
  });
  const { app, requests } = createTestApp([
    jsonResponse(saved),
    jsonResponse(updated),
  ]);
  app.form.url = saved.url;
  app.tagify = {
    value: [{ value: 'saved-tag' }],
    removeAllTags() {},
    addTags() {},
  };

  await app.checkExistingBookmark();
  app.form.url = ' https://example.com/updated ';
  app.$refs.descriptionInput.value = ' 中文描述 ';
  await app.submit();

  const updateRequest = requests[1];
  assert.equal(updateRequest.url, `${BKMRX_API}/api/bookmarks/${saved.id}`);
  assert.equal(updateRequest.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(updateRequest.options.body), {
    url: 'https://example.com/updated',
    title: saved.title,
    tags: ['saved-tag'],
    description: '中文描述',
  });
  assert.equal(app.existingBookmark.id, saved.id);
  assert.equal(app.form.url, updated.url);
  assert.equal(app.form.description, '中文描述');
  assert.match(app.successMessage, /42/);
});

test('creating a bookmark sends trimmed live form values', async () => {
  const created = bookmark({ id: 7, title: 'New title', description: 'New description' });
  const { app, requests } = createTestApp([
    jsonResponse(created, { status: 201 }),
    jsonResponse([]),
  ]);
  app.form = {
    url: ' https://example.com/new ',
    title: ' New title ',
    description: 'stale description',
  };
  app.$refs.descriptionInput.value = ' New description ';

  await app.submit();

  assert.equal(requests[0].url, `${BKMRX_API}/api/bookmarks`);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    url: 'https://example.com/new',
    title: 'New title',
    tags: [],
    description: 'New description',
  });
  assert.equal(app.mode, 'update');
  assert.equal(app.existingBookmark, created);
});

test('submit reports API failures and always clears submitting state', async () => {
  const { app } = createTestApp([
    jsonResponse({ error: { message: 'Invalid bookmark' } }, { status: 400, ok: false }),
  ]);
  app.form.url = 'https://example.com';

  await app.submit();

  assert.equal(app.errorMessage, 'Invalid bookmark');
  assert.equal(app.submitting, false);
  assert.equal(app.successMessage, '');
});

test('loadTagWhitelist updates Tagify only for array responses', async () => {
  const { app } = createTestApp([
    jsonResponse([{ name: 'rust' }, { name: 'frontend' }]),
  ]);
  let rebuilt = false;
  app.tagify = {
    settings: { whitelist: [] },
    dropdown: { rebuild() { rebuilt = true; } },
  };

  await app.loadTagWhitelist();

  assert.deepEqual(app.tagify.settings.whitelist, ['rust', 'frontend']);
  assert.equal(rebuilt, true);
});
