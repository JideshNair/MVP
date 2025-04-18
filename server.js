import express from 'express';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let apiCalls = [];
  page.on('response', async (response) => {
    try {
      const ct = response.headers()['content-type'];
      if (ct?.includes('application/json')) {
        const body = await response.json();
        apiCalls.push({ url: response.url(), status: response.status(), body });
      }
    } catch {}
  });

  await page.goto(url, { waitUntil: 'load' });

  const jsVars = await page.evaluate(() => ({
    title: document.title,
    href: window.location.href,
    user: window.user || null,
    meta: window.ShopifyAnalytics?.meta || null
  }));

  await browser.close();

  res.json({ jsVars, apiCalls });
});

app.listen(3000, () => {
  console.log('MVP running at http://localhost:3000');
});
