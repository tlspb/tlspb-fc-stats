import { setTimeout as sleep } from 'node:timers/promises';
import { appendFile } from 'node:fs/promises';

export function skipOleAsset(request) {
  if (['image', 'media', 'font'].includes(request.resourceType())) return true;
  const url = new URL(request.url());
  // This optional branding stylesheet can hang and prevent deferred scripts
  // from running. Keep OLE's own layout CSS and every data/script request.
  return url.origin === 'https://engine.amateum.com' && url.pathname === '/files/theme.css';
}

export async function prepareOlePage(page) {
  await page.route('**/*', route => skipOleAsset(route.request()) ? route.abort() : route.continue());
}

function watchLoading(page) {
  const requests = new Map();
  const failures = new Map();
  if (!page.on || !page.off) return { describe: () => '', stop: () => {} };
  function publicDependency(request) {
    const url = new URL(request.url());
    return (url.origin === 'https://engine.amateum.com' && url.pathname.startsWith('/client/')) ||
      (url.origin === 'https://olesports.ru' && url.pathname.startsWith('/static/js/'))
      ? url.origin + url.pathname : null;
  }
  const start = request => {
    const url = publicDependency(request);
    if (url) requests.set(request, url);
  };
  const response = response => {
    const url = publicDependency(response.request());
    if (url && response.status() >= 400) failures.set(url, 'HTTP ' + response.status());
  };
  const finished = request => requests.delete(request);
  const failed = request => {
    const url = requests.get(request);
    if (url) failures.set(url, request.failure()?.errorText || 'network failure');
    requests.delete(request);
  };
  const handlers = { request: start, response, requestfinished: finished, requestfailed: failed };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  return {
    describe() {
      const lines = [...failures].map(([url, reason]) => `${reason}: ${url}`);
      const pending = [...new Set(requests.values())].sort((a, b) =>
        Number(!a.includes('/standings/')) - Number(!b.includes('/standings/')));
      lines.push(...pending.map(url => `No completed response: ${url}`));
      return lines.length ? '\nOLE loading diagnostics:\n' + lines.slice(0, 8).join('\n') : '';
    },
    stop() { for (const [event, handler] of Object.entries(handlers)) page.off(event, handler); },
  };
}

function retryable(error) {
  if (error.httpStatus) return error.httpStatus === 408 || error.httpStatus >= 500;
  return error.name === 'TimeoutError' || /net::ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|NETWORK_CHANGED|NAME_NOT_RESOLVED)\b/.test(error.message);
}

async function reportLoadingFailure(url, error) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\n## OLE: source could not be loaded\n\nPublic page: ${url}\n\nLast verified statistics remain unchanged.\n\n\`\`\`text\n${error.message}\n\`\`\`\n`);
  }
}

// Wait for the actual football content, rather than unrelated deferred scripts.
// Retry only loading failures; data validation remains outside this function.
export async function openOlePage(page, url, {
  ready = async () => {}, attempts = 3, timeout = 45000,
  pause = sleep, warn = console.warn, report = reportLoadingFailure,
} = {}) {
  const target = new URL(url);
  if (target.origin !== 'https://olesports.ru' || !/^\/(?:tournament|match|club)\/[a-f0-9]{24}$/.test(target.pathname)) {
    throw new Error('Unexpected OLE public-page URL');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('Invalid retry limit');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const loading = watchLoading(page);
    try {
      const response = await page.goto(url, { waitUntil: 'commit', timeout });
      if (!response || !response.ok()) {
        const error = new Error(`OLE page returned HTTP ${response?.status() ?? 'no response'}`);
        error.httpStatus = response?.status() ?? 0;
        throw error;
      }
      await ready();
      return;
    } catch (error) {
      const isLoadingFailure = retryable(error);
      if (isLoadingFailure) error.message += loading.describe();
      if (!isLoadingFailure || attempt === attempts) {
        if (isLoadingFailure) await report(url, error);
        throw error;
      }
      const delay = 15000 * attempt;
      warn(`OLE loading attempt ${attempt}/${attempts} failed: ${error.message}. Retrying in ${delay / 1000}s.`);
      loading.stop();
      await pause(delay);
    } finally {
      loading.stop();
    }
  }
}
