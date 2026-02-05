const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CLIENT ================= */
const cookieJar = new CookieJar();

const client = got.extend({
  cookieJar,
  timeout: { request: 20000 },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome Mobile Safari/537.36'
  },
  retry: { limit: 1 }
});

/* ================= CONFIG ================= */
const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;

const SMS_API_URL =
  'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg==&records=10';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

/* ================= CACHE ================= */
let cachedNumbers = null;
let lastNumbersFetch = 0;
const NUMBERS_CACHE_TIME = 5 * 60 * 1000;

let lastSmsFetch = 0;
const SMS_COOLDOWN = 6000;

/* ================= HELPERS ================= */
function getCountryFromNumber(number) {
  try {
    if (!number) return 'Unknown';
    const n = number.startsWith('+') ? number : `+${number}`;
    const phone = parsePhoneNumber(n);
    if (phone && phone.country) {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(phone.country);
    }
    return 'International';
  } catch {
    return 'Unknown';
  }
}

/* ================= LOGIN ================= */
async function ensureLoggedIn() {
  try {
    const r = await client.get(LOGIN_URL);
    const $ = cheerio.load(r.body);
    const txt = $('label:contains("What is")').text();
    const m = txt.match(/(\d+)\s*\+\s*(\d+)/);
    const capt = m ? Number(m[1]) + Number(m[2]) : 10;

    await client.post(SIGNIN_URL, {
      form: {
        username: USERNAME,
        password: PASSWORD,
        capt
      },
      headers: { Referer: LOGIN_URL }
    });
  } catch (e) {
    console.log('⚠️ Login error ignored:', e.message);
  }
}

/* ================= ROUTES ================= */
app.get('/', (req, res) => {
  res.send('✅ NumberPanel Proxy Running');
});

/* -------- Numbers API -------- */
app.get('/api/numbers', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedNumbers && now - lastNumbersFetch < NUMBERS_CACHE_TIME) {
      return res.json(cachedNumbers);
    }

    await ensureLoggedIn();

    const fdate1 = '2026-01-01 00:00:00';
    const fdate2 = moment()
      .tz('Asia/Karachi')
      .format('YYYY-MM-DD 23:59:59');

    const params = new URLSearchParams({
      fdate1,
      fdate2,
      iDisplayStart: 0,
      iDisplayLength: -1,
      _: Date.now()
    });

    const r = await client.get(`${DATA_URL}?${params}`, {
      headers: {
        Referer: `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      responseType: 'json'
    });

    cachedNumbers = r.body;
    lastNumbersFetch = now;
    res.json(r.body);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch number stats' });
  }
});

/* -------- SMS API (ANTI-CRASH) -------- */
app.get('/api/sms', async (req, res) => {
  try {
    const now = Date.now();
    if (now - lastSmsFetch < SMS_COOLDOWN) {
      return res.status(429).json({ error: 'Please wait few seconds' });
    }
    lastSmsFetch = now;

    const r = await got.get(SMS_API_URL, { timeout: 20000 });
    const raw = r.body.toString().trim();

    if (raw.includes('accessed this site too many times')) {
      return res.status(429).json({
        error: 'Upstream rate limited',
        retry_after: 5
      });
    }

    if (!raw.startsWith('[')) {
      return res.status(502).json({
        error: 'Upstream SMS API returned invalid JSON',
        raw: raw.slice(0, 150)
      });
    }

    const data = JSON.parse(raw);

    const aaData = data.map(i => [
      i[3] || '',
      getCountryFromNumber(i[1]),
      i[1] || '',
      i[0] || '',
      i[2] || '',
      '$',
      '€',
      0.005
    ]);

    res.json({
      sEcho: 1,
      iTotalRecords: aaData.length,
      iTotalDisplayRecords: aaData.length,
      aaData
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch SMS data' });
  }
});

/* ================= START ================= */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
