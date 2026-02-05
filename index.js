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
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;

const SMS_API_URL =
  'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg==&records=50';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

/* ================= CLIENT ================= */

const cookieJar = new CookieJar();

const client = got.extend({
  cookieJar,
  decompress: true,
  timeout: { request: 20000 },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome Mobile',
    Accept: '*/*'
  }
});

/* ================= HELPERS ================= */

function getCountryFromNumber(number) {
  try {
    if (!number) return 'Unknown';
    const n = number.toString().startsWith('+')
      ? number.toString()
      : '+' + number.toString();
    const phone = parsePhoneNumber(n);
    if (!phone || !phone.country) return 'International';
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(phone.country);
  } catch {
    return 'Unknown';
  }
}

async function ensureLoggedIn() {
  const page = await client.get(LOGIN_URL);
  const $ = cheerio.load(page.body);

  const text = $('label:contains("What is")').text();
  const match = text.match(/(\d+)\s*\+\s*(\d+)/);
  const captcha = match ? parseInt(match[1]) + parseInt(match[2]) : 0;

  await client.post(SIGNIN_URL, {
    form: {
      username: USERNAME,
      password: PASSWORD,
      capt: captcha
    },
    headers: { Referer: LOGIN_URL }
  });
}

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
  res.send('✅ Number Panel Proxy Running');
});

/* -------- NUMBERS -------- */

app.get('/api/numbers', async (req, res) => {
  try {
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
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`
      }
    });

    let body = r.body;
    if (typeof body === 'string') body = JSON.parse(body);
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch number stats' });
  }
});

/* -------- SMS (FIXED) -------- */

app.get('/api/sms', async (req, res) => {
  try {
    const r = await got.get(SMS_API_URL, {
      decompress: true,
      timeout: { request: 20000 }
    });

    let data = r.body;

    if (typeof data === 'string') {
      data = data.trim();
      if (data.startsWith('[') && data.endsWith(']')) {
        data = JSON.parse(data);
      } else {
        return res.status(502).json({
          error: 'Upstream SMS API returned invalid JSON',
          raw: data.slice(0, 200)
        });
      }
    }

    if (!Array.isArray(data)) {
      return res.status(502).json({ error: 'SMS data is not array' });
    }

    const formatted = data.map(item => [
      item[3] || '',
      getCountryFromNumber(item[1]),
      item[1] || '',
      item[0] || '',
      item[2] || '',
      '$',
      '€',
      0.005
    ]);

    res.json({
      sEcho: 1,
      iTotalRecords: formatted.length,
      iTotalDisplayRecords: formatted.length,
      aaData: formatted
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Failed to fetch SMS data' });
  }
});

/* ================= START ================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
