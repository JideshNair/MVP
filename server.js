import express from 'express';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Utility: Flatten nested JSON
function flatten(obj, prefix = '', result = {}) {
  for (let key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      flatten(obj[key], fullKey, result);
    } else {
      result[fullKey] = obj[key];
    }
  }
  return result;
}

app.post('/analyze', async (req, res) => {
  const { url } = req.body;

  const browser = await chromium.launch({ headless: false }); // headless: false to see browser for debugging
  const page = await browser.newPage();

  const apiResponses = [];
  const clickedElements = [];

  // 1. Capture API Responses
  page.on('response', async (response) => {
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          flattened: flatten(json),
          raw: json,
        });
      }
    } catch (err) {
      // Ignore parse failures
    }
  });

  // 2. Expose capture function for DOM clicks
  await page.exposeFunction('captureClickEvent', (data) => {
    clickedElements.push(data);
  });

  // 3. Inject DOM click tracker before page loads
  await page.addInitScript(() => {
    document.addEventListener(
      'click',
      function (e) {
        window.captureClickEvent({
          tag: e.target.tagName,
          id: e.target.id,
          class: e.target.className,
          text: e.target.innerText,
          dataset: { ...e.target.dataset },
        });
      },
      true
    );
  });

  // 4. Navigate to target site
  await page.goto(url, { waitUntil: 'networkidle' });

  // 5. Collect global variables
  const globalVars = await page.evaluate(() => ({
    title: document.title,
    location: window.location.href,
    user: window.user || null,
    dataLayer: window.dataLayer || null,
    shopify: window.ShopifyAnalytics?.meta || null,
  }));

  await browser.close();

  res.json({
    urlAnalyzed: url,
    globals: globalVars,
    apiResponses,
    domEvents: clickedElements,
  });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
