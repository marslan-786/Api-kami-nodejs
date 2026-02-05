const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */

const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const NUMBERS_URL = `${TARGET_HOST}/NumberPanel/agent/MySMSNumbers2`;
const SMS_API_URL =
  'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg==&dt1=2026-02-04 05:18:03&dt2=2126-05-09 05:18:16&records=10';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

/* ================= CLIENT ================= */

const cookieJar = new CookieJar();
const client = got.extend({
  cookieJar,
  timeout: 20000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  },
  retry: { limit: 0 }
});

/* ================= CACHE ================= */

let cachedNumbers = null;
let cachedSms = null;
let lastNumberFetch = 0;
let lastSmsFetch = 0;

const NUMBER_CACHE = 5 * 60 * 1000; // 5 min
const SMS_COOLDOWN = 5000; // 5 sec

/* ================= HELPERS ================= */

function getCountryFromNumber(number) {
  try {
    const num = number.toString().startsWith('+') ? number : '+' + number;
    const phone = parsePhoneNumber(num);
    if (!phone || !phone.country) return 'International';
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(phone.country);
  } catch {
    return 'Unknown';
  }
}

async function ensureLoggedIn() {
  try {
    const page = await client.get(LOGIN_URL);
    const $ = cheerio.load(page.body);
    const label = $('label:contains("What is")').text();
    const m = label.match(/(\d+)\s*\+\s*(\d+)/);
    const capt = m ? Number(m[1]) + Number(m[2]) : 10;

    await client.post(SIGNIN_URL, {
      form: { username: USERNAME, password: PASSWORD, capt },
      headers: { Referer: LOGIN_URL }
    });
    console.log('✅ Logged in successfully');
  } catch (e) {
    console.error('❌ Login error:', e.message);
  }
}

/* ================= ROUTES ================= */

app.get('/', (_, res) => {
  res.send('NumberPanel Proxy Running ✅');
});

/* ===== Numbers API ===== */

app.get('/api/numbers', async (_, res) => {
  try {
    if (cachedNumbers && Date.now() - lastNumberFetch < NUMBER_CACHE) {
      return res.json(cachedNumbers);
    }

    await ensureLoggedIn();

    const fdate1 = '2026-01-01 00:00:00';
    const fdate2 = moment().tz('Asia/Karachi').format('YYYY-MM-DD 23:59:59');

    const params = new URLSearchParams({
      fdate1,
      fdate2,
      frange: '',
      fclient: '',
      fallocated: '',
      sEcho: 2,
      iColumns: 8,
      sColumns: ',,,,,,,',
      iDisplayStart: 0,
      iDisplayLength: -1,
      sSearch: '',
      bRegex: false,
      iSortCol_0: 0,
      sSortDir_0: 'asc',
      iSortingCols: 1,
      _: Date.now()
    });

    const r = await client.get(`${NUMBERS_URL}?${params}`, {
      headers: { Referer: `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats` }
    });

    cachedNumbers = JSON.parse(r.body);
    lastNumberFetch = Date.now();

    res.json(cachedNumbers);
  } catch (e) {
    console.error('❌ Numbers fetch error:', e.message);
    if (cachedNumbers) return res.json(cachedNumbers);
    res.status(500).json({ error: 'Failed to fetch number stats' });
  }
});

/* ===== SMS API ===== */

app.get('/api/sms', async (_, res) => {
  try {
    const now = Date.now();

    if (cachedSms && now - lastSmsFetch < SMS_COOLDOWN) {
      return res.json(cachedSms);
    }

    lastSmsFetch = now;

    const r = await got.get(SMS_API_URL, { timeout: 20000 });
    const raw = r.body.toString().trim();

    if (
      raw.includes('accessed this site too many times') ||
      raw.includes('Please wait')
    ) {
      if (cachedSms) return res.json(cachedSms);
      return res.json({
        sEcho: 1,
        iTotalRecords: 0,
        iTotalDisplayRecords: 0,
        aaData: []
      });
    }

    if (!raw.startsWith('[')) {
      if (cachedSms) return res.json(cachedSms);
      throw new Error('Invalid JSON');
    }

    const data = JSON.parse(raw);

    const aaData = data.map(i => [
      i[3],
      getCountryFromNumber(i[1]),
      i[1],
      i[0],
      i[2],
      '$',
      '€',
      0.005
    ]);

    cachedSms = {
      sEcho: 1,
      iTotalRecords: aaData.length,
      iTotalDisplayRecords: aaData.length,
      aaData
    };

    res.json(cachedSms);
  } catch (e) {
    console.error('❌ SMS fetch error:', e.message);
    if (cachedSms) return res.json(cachedSms);
    res.status(500).json({ error: 'Failed to fetch SMS data' });
  }
});

/* ================= START SERVER ================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
