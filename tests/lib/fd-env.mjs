export const expectedBuild = Number(process.env.FD_EXPECTED_BUILD || process.env.FD_BUILD || 213);

export function gameUrl({ port = 8765, base = 'frontline-dominion' } = {}) {
  if (process.env.FD_GAME_URL) return process.env.FD_GAME_URL;
  return `http://127.0.0.1:${port}/${base}/frontline-dominion.html?build=${expectedBuild}`;
}

export function baseUrl({ port = 8765, base = 'frontline-dominion' } = {}) {
  return process.env.FD_BASE_URL || `http://127.0.0.1:${port}/${base}`;
}

export function multiplayerUrl({ port = 8765, base = 'frontline-dominion' } = {}) {
  if (process.env.FD_MULTIPLAYER_URL) return process.env.FD_MULTIPLAYER_URL;
  return `http://127.0.0.1:${port}/${base}/multiplayer.html?build=${expectedBuild}`;
}

export async function waitFor(page, fn, arg = undefined, timeout = 45000, interval = 100, browserErrors = []) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    if (browserErrors.length) throw new Error(`Browser error: ${JSON.stringify(browserErrors)}`);
    last = await page.evaluate(fn, arg);
    if (last && !last.__pending) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}; errors=${JSON.stringify(browserErrors)}`);
}

export async function runtimeCapabilities(page) {
  return page.evaluate(() => {
    const globals = Object.keys(globalThis);
    const latest = prefix => globals.filter(k => k.startsWith(prefix)).sort((a, b) => {
      const na = Number(a.match(/_(\d+)__$/)?.[1] || 0);
      const nb = Number(b.match(/_(\d+)__$/)?.[1] || 0);
      return nb - na;
    })[0] || null;
    const value = prefix => {
      const key = latest(prefix);
      return { key, value: key ? globalThis[key] : null };
    };
    return {
      logisticsIntegrity: value('__FD_LOGISTICS_INTEGRITY'),
      runtimeShell: value('__FD_RUNTIME_SHELL'),
      saveSlots: value('__FD_SAVE_SLOTS'),
      gameplay: value('__FD_GAMEPLAY'),
      buildMeta: globalThis.__FD_BUILD_META__ || null,
    };
  });
}

export function requireCapability(capabilities, group, property) {
  const bucket = capabilities?.[group];
  if (!bucket?.value?.[property]) throw new Error(`Missing capability ${group}.${property}; owner=${bucket?.key || 'none'} value=${JSON.stringify(bucket?.value || null)}`);
  return bucket.value[property];
}
