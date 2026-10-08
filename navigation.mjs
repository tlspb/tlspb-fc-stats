import { setTimeout as sleep } from 'node:timers/promises';

function retryable(error) {
  if (error.httpStatus) return error.httpStatus === 408 || error.httpStatus >= 500;
  return error.name === 'TimeoutError' || /net::ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|NETWORK_CHANGED|NAME_NOT_RESOLVED)\b/.test(error.message);
}

// Wait for the actual football content, rather than unrelated deferred scripts.
// Retry only loading failures; data validation remains outside this function.
export async function openOlePage(page, url, {
  ready = async () => {}, attempts = 3, timeout = 45000,
  pause = sleep, warn = console.warn,
} = {}) {
  const target = new URL(url);
  if (target.origin !== 'https://olesports.ru' || !/^\/(?:tournament|match|club)\/[a-f0-9]{24}$/.test(target.pathname)) {
    throw new Error('Unexpected OLE public-page URL');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('Invalid retry limit');
  for (let attempt = 1; attempt <= attempts; attempt++) {
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
      if (!retryable(error) || attempt === attempts) throw error;
      const delay = 15000 * attempt;
      warn(`OLE loading attempt ${attempt}/${attempts} failed: ${error.message}. Retrying in ${delay / 1000}s.`);
      await pause(delay);
    }
  }
}
