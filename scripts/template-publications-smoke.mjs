const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.TOKEN?.trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
if (!command) {
  fail('Usage: node scripts/template-publications-smoke.mjs <list|create-project|create-selection|public-list|public-get> [...]');
}

async function api(path, init = {}) {
  if (!TOKEN) {
    fail('TOKEN is required for authenticated commands');
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    fail(`Request failed for ${BASE_URL}${path}. Is the server running?`);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    fail(`HTTP ${response.status} for ${path}`);
  }

  return payload;
}

async function publicApi(path) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`);
  } catch (error) {
    fail(`Request failed for ${BASE_URL}${path}. Is the server running?`);
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    fail(`HTTP ${response.status} for ${path}`);
  }
  return payload;
}

switch (command) {
  case 'list': {
    const payload = await api('/api/template-publications');
    console.log(JSON.stringify(payload, null, 2));
    break;
  }

  case 'create-project': {
    const [kind, ...titleParts] = rest;
    const title = titleParts.join(' ').trim();
    if (!kind || !title) {
      fail('Usage: create-project <template|block> <title>');
    }
    const payload = await api('/api/template-publications/project', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        title,
        visibility: 'both',
      }),
    });
    console.log(JSON.stringify(payload, null, 2));
    break;
  }

  case 'create-selection': {
    const [kind, rootTaskIdsRaw, ...titleParts] = rest;
    const title = titleParts.join(' ').trim();
    if (!kind || !rootTaskIdsRaw || !title) {
      fail('Usage: create-selection <template|block> <taskId1,taskId2> <title>');
    }
    const rootTaskIds = rootTaskIdsRaw.split(',').map((value) => value.trim()).filter(Boolean);
    const payload = await api('/api/template-publications/selection', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        title,
        rootTaskIds,
        visibility: 'both',
      }),
    });
    console.log(JSON.stringify(payload, null, 2));
    break;
  }

  case 'public-list': {
    const kind = rest[0] ?? 'template';
    const payload = await publicApi(`/api/public/template-publications?visibilityTarget=site&kind=${encodeURIComponent(kind)}`);
    console.log(JSON.stringify(payload, null, 2));
    break;
  }

  case 'public-get': {
    const slug = rest[0];
    if (!slug) {
      fail('Usage: public-get <slug>');
    }
    const payload = await publicApi(`/api/public/template-publications/${encodeURIComponent(slug)}?visibilityTarget=site`);
    console.log(JSON.stringify(payload, null, 2));
    break;
  }

  default:
    fail(`Unknown command: ${command}`);
}
