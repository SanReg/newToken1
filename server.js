/**
 * Puppeteer-based extractor that mimics the functionality of extractor2.py
 * - Opens ryne.ai
 * - Optionally auto-login if EMAIL and PASSWORD env vars are set
 * - Monitors outgoing requests for Authorization header (Bearer token) and Cookie
 * - Saves token.txt, Cookie.txt, token.json and optionally POSTs to APP_URL/token/update
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// load .env variables from .env file if present
require('dotenv').config();

// portable sleep helper (avoids using page.waitForTimeout which may not exist)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors()); // Allow all origins
const PORT = process.env.PORT || 3000;

// extraction status tracker
let extractionStatus = 'idle'; // idle|running|success|error|notfound
let lastResult = null;

const EMAIL = process.env.EMAIL || process.env.RYNE_EMAIL;
const PASSWORD = process.env.PASSWORD || process.env.RYNE_PASSWORD;
if (!EMAIL || !PASSWORD) console.warn('⚠️ EMAIL or PASSWORD not set in environment; auto-login will be skipped.');

// Posting to external APP_URL has been removed; use /token and /cookie endpoints instead.
const MAX_WAIT_SECONDS = parseInt(process.env.EXTRACTOR_WAIT || '30', 10);

async function extractToken({ headless = true } = {}) {
  extractionStatus = 'running';
  lastResult = null;

  const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-networking',
    '--window-size=1920,1080'
  ];

  let browser;
  let token = null;
  let cookies = null;

  try {
    const launchOptions = { headless: !!headless, args: browserArgs };
    // Allow overriding Chrome binary via env vars (PUPPETEER_EXECUTABLE_PATH, CHROME_BIN, etc.)
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || process.env.GOOGLE_CHROME_SHIM;
    if (execPath) {
      launchOptions.executablePath = execPath;
      console.log('Using Chrome executable:', launchOptions.executablePath);
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    page.on('request', (req) => {
      try {
        const headers = req.headers();
        const url = req.url();
        if ((url.includes('supabase.co/rest/v1/') || url.includes('ryne.ai')) && headers['authorization']) {
          const auth = headers['authorization'];
          if (auth && auth.toLowerCase().startsWith('bearer ')) {
            token = auth; // store full header like 'Bearer <token>'
            console.log('✅ Token found from request to', url);
          }
        }
        if ((url.includes('supabase.co/rest/v1/') || url.includes('ryne.ai')) && headers['cookie']) {
          cookies = headers['cookie'];
          console.log('✅ Cookies found from request to', url);
        }
      } catch (e) {
        // ignore
      }
    });

    if (EMAIL && PASSWORD) {
      console.log('🌐 Opening ryne.ai signin page...');
      await page.goto('https://ryne.ai/signin', { waitUntil: 'networkidle2' });
      await sleep(1000);

      try {
        console.log('🔐 Attempting auto-login...');

        // email input
        const emailSel = "input[type='email'], input[name='email']";
        const passSel = "input[type='password'], input[name='password']";
        await page.waitForSelector(emailSel, { timeout: 10000 });
        await page.type(emailSel, EMAIL, { delay: 50 });
        await page.waitForSelector(passSel, { timeout: 5000 });
        await page.type(passSel, PASSWORD, { delay: 50 });
        await page.keyboard.press('Enter');
        console.log('✅ Submitted credentials');
        await sleep(5000);
        console.log('📊 Navigating to dashboard...');
        await page.goto('https://ryne.ai/dashboard', { waitUntil: 'networkidle2' });
        await sleep(2000);
      } catch (err) {
        console.log('⚠️ Auto-login failed:', err.message || err);
        console.log('Please log in manually...');
      }
    } else {
      console.log('🌐 Opening ryne.ai...');
      await page.goto('https://www.ryne.ai', { waitUntil: 'networkidle2' });
      console.log('⏳ Please log in manually in the browser window... (Manual login flow when running headless is limited)');
    }

    console.log(`⏳ Waiting for authenticated requests (${MAX_WAIT_SECONDS} seconds)...`);

    for (let i = 0; i < MAX_WAIT_SECONDS; i++) {
      if (token) break;
      if (i % 5 === 0) console.log(`   Still waiting... (${MAX_WAIT_SECONDS - i}s remaining)`);
      await sleep(1000);
    }

    if (!token) {
      console.log('\n❌ Could not find JWT token in requests');
      try { await browser.close(); } catch (e) {}
      extractionStatus = 'notfound';
      lastResult = { success: false, reason: 'no_token_found' };
      return lastResult;
    }

    console.log('\n✅ Successfully extracted JWT token!');

    // Save token and cookies
    fs.writeFileSync('token.txt', token, { encoding: 'utf8' });
    console.log('💾 Token saved to token.txt');
    if (cookies) {
      fs.writeFileSync('Cookie.txt', cookies, { encoding: 'utf8' });
      console.log('💾 Cookies saved to Cookie.txt');
    }

    const token_data = { token, cookies: cookies || null, extracted_at: new Date().toISOString(), format: 'Bearer JWT' };
    fs.writeFileSync('token.json', JSON.stringify(token_data, null, 2), { encoding: 'utf8' });
    console.log('💾 Token metadata saved to token.json');

    // Posting to external app disabled.
    // Tokens and cookies are now retrievable via the /token and /cookie HTTP endpoints.

    try { await browser.close(); } catch (e) {}
    console.log('\n✅ All done!');

    extractionStatus = 'success';
    lastResult = { success: true, token_data };
    return token_data;
  } catch (e) {
    console.error('❌ Error during extraction:', e);
    if (browser) try { await browser.close(); } catch (ignored) {}
    extractionStatus = 'error';
    lastResult = { success: false, error: e.message || String(e) };
    throw e;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔑 Ryne.AI JWT Token Extractor (Puppeteer) - HTTP mode');
  console.log('='.repeat(60));

  app.get('/status', (req, res) => {
    res.json({ status: extractionStatus, lastResult });
  });

  const triggerHandler = async (req, res) => {
    if (extractionStatus === 'running') return res.status(409).json({ status: 'running' });
    try {
      const result = await extractToken();
      res.json({ status: 'success', result });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message || String(err) });
    }
  };

  app.post('/extract', triggerHandler);
  app.get('/extract', triggerHandler);

  // serve saved token and cookie files (explicit CORS so these endpoints are not disallowed)
  // allow simple cross-origin GETs and preflight OPTIONS
  app.options(['/token', '/cookie'], cors());
  app.get('/token', cors(), (req, res) => {
    const p = path.resolve('token.txt');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'token not found' });
    const data = fs.readFileSync(p, 'utf8');
    // ensure browsers can read content-type and other safe headers
    res.set('Access-Control-Expose-Headers', 'Content-Type');
    res.type('text/plain').send(data);
  });

  app.get('/cookie', cors(), (req, res) => {
    const p = path.resolve('Cookie.txt');
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'cookie not found' });
    const data = fs.readFileSync(p, 'utf8');
    res.set('Access-Control-Expose-Headers', 'Content-Type');
    res.type('text/plain').send(data);
  });

  app.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));

  // Optionally run on start if requested
  if (process.env.RUN_ON_START === '1' || process.env.RUN_ON_START === 'true') {
    try { await extractToken(); } catch (e) { /* already tracked */ }
  }
}

// Node 18+ has global fetch; fallback for older nodes would require node-fetch
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

main();
