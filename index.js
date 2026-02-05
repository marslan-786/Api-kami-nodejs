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
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumbers2.php`;

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
  } catch (e) {
    console.error('Login error:', e.message);
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

    const ts = Date.now();

    const params =
      `frange=&fclient=` +
      `&fdate1=2026-01-01 00:00:00` +
      `&fdate2=${moment().tz('Asia/Karachi').format('YYYY-MM-DD 23:59:59')}` +
      `&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C` +
      `&iDisplayStart=0&iDisplayLength=-1` +
      `&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true` +
      `&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true` +
      `&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true` +
      `&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true` +
      `&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true` +
      `&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true` +
      `&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1` +
      `&_=${ts}`;

    const r = await client.get(
      `${TARGET_HOST}/agent/res/data_smsnumbers2.php?${params}`,
      {
        headers: { Referer: `${TARGET_HOST}/agent/SMSNumbers` }
      }
    );

    cachedNumbers = JSON.parse(r.body);
    lastNumberFetch = Date.now();

    res.json(cachedNumbers);
  } catch (e) {
    console.error('Numbers fetch error:', e.message);
    if (cachedNumbers) return res.json(cachedNumbers);
    res.status(500).json({ error: 'Failed to fetch number stats' });
  }
});

/* ===== SMS API (unchanged) ===== */
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
    if (cachedSms) return res.json(cachedSms);
    res.status(500).json({ error: 'Failed to fetch SMS data' });
  }
});

/* ================= START SERVER ================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
