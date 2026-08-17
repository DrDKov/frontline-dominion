import { webkit } from 'playwright';

const url = process.env.FD_GAME_URL || 'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=188';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  hasTouch: true,
  isMobile: false,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.stack || error)));

await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(500);

await page.evaluate(() => {
  const start = document.getElementById('start-screen');
  globalThis.__FD_START_MUTATIONS_189__ = [];
  if (!start) return;
  const observer = new MutationObserver(records => {
    globalThis.__FD_START_MUTATIONS_189__.push({
      at: Math.round(performance.now()),
      count: records.length,
      text: (start.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 700),
      htmlLength: start.innerHTML.length,
      buttonIds: [...start.querySelectorAll('button')].map(button => button.id || button.textContent.trim()),
    });
  });
  observer.observe(start, { subtree: true, childList: true, characterData: true, attributes: true });
  globalThis.__FD_START_OBSERVER_189__ = observer;
});

const samples = [];
for (let index = 0; index < 50; index += 1) {
  samples.push(await page.evaluate(() => {
    const start = document.getElementById('start-screen');
    const button = document.getElementById('start-game');
    return {
      at: Math.round(performance.now()),
      title: document.title,
      text: (start?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
      htmlLength: start?.innerHTML?.length || 0,
      buttons: [...(start?.querySelectorAll('button') || [])].map(element => ({
        id: element.id,
        text: element.textContent.trim(),
        className: element.className,
        disabled: element.disabled,
        dataset: { ...element.dataset },
        onclick: typeof element.onclick,
      })),
      startButtonConnected: !!button?.isConnected,
    };
  }));
  await page.waitForTimeout(80);
}

const summary = await page.evaluate(() => {
  const start = document.getElementById('start-screen');
  const inline = [...document.scripts]
    .filter(script => !script.src && /start-game|new Game\(|startGame|load-game/i.test(script.textContent || ''))
    .map(script => (script.textContent || '').slice(0, 12000));
  return {
    outerHTML: start?.outerHTML?.slice(0, 16000) || null,
    mutations: globalThis.__FD_START_MUTATIONS_189__ || [],
    inline,
    globals: Object.getOwnPropertyNames(globalThis)
      .filter(name => /start|load|game/i.test(name) && typeof globalThis[name] === 'function')
      .slice(0, 100),
  };
});

console.log('START189_SAMPLES ' + JSON.stringify({
  uniqueTitles: [...new Set(samples.map(sample => sample.title))],
  uniqueTexts: [...new Set(samples.map(sample => sample.text))],
  uniqueButtonSets: [...new Set(samples.map(sample => JSON.stringify(sample.buttons)))],
  disconnectedSamples: samples.filter(sample => !sample.startButtonConnected).length,
}));
console.log('START189_DOM ' + JSON.stringify(summary));

let clickResult = null;
try {
  await page.locator('#start-game').click({ timeout: 10000 });
  for (let index = 0; index < 100; index += 1) {
    clickResult = await page.evaluate(() => ({
      game: !!globalThis.__FD_DEBUG__?.game,
      tick: Number(globalThis.__FD_STABLE_STATE165__?.bridge?.workerTick || 0),
      startDisplay: getComputedStyle(document.getElementById('start-screen')).display,
      href: location.href,
    }));
    if (clickResult.game && clickResult.tick > 0) break;
    await page.waitForTimeout(80);
  }
} catch (error) {
  clickResult = { error: String(error?.stack || error) };
}
console.log('START189_CLICK ' + JSON.stringify(clickResult));
console.log('START189_ERRORS ' + JSON.stringify(errors));
await browser.close();
