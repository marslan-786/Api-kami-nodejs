const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CLIENT SETUP =================
const cookieJar = new CookieJar();

const client = got.extend({
    cookieJar,
    timeout: { request: 15000 },
    retry: { limit: 2 },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
        'Accept': 'application/json,text/plain,*/*'
    }
});

// ================= PANEL CONFIG =================
const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;

const SMS_API_URL =
    'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg==&dt1=2026-02-04 05:18:03&dt2=2126-05-09 05:18:16&records=10';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

// ================= CACHE =================
let cachedNumberData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// ================= HELPERS =================
function getCountryFromNumber(number) {
    try {
        if (!number) return "Unknown";
        const num = number.toString().startsWith('+') ? number.toString() : '+' + number;
        const parsed = parsePhoneNumber(num);
        if (!parsed || !parsed.country) return "International";
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(parsed.country);
    } catch {
        return "Unknown";
    }
}

// ================= LOGIN =================
async function ensureLoggedIn() {
    try {
        const loginPage = await client.get(LOGIN_URL);
        const $ = cheerio.load(loginPage.body);

        const label = $('label:contains("What is")').text();
        const match = label.match(/(\d+)\s*\+\s*(\d+)/);

        const capt = match ? parseInt(match[1]) + parseInt(match[2]) : 10;

        await client.post(SIGNIN_URL, {
            form: {
                username: USERNAME,
                password: PASSWORD,
                capt
            },
            headers: { Referer: LOGIN_URL }
        });

        console.log('✅ Panel login OK');
    } catch (e) {
        console.error('❌ Login error:', e.message);
    }
}

// ================= ROUTES =================
app.get('/', (req, res) => {
    res.send('Panel Proxy Running');
});

// ---------- NUMBERS ----------
app.get('/api/numbers', async (req, res) => {
    try {
        const now = Date.now();
        if (cachedNumberData && now - lastFetchTime < CACHE_DURATION) {
            return res.json(cachedNumberData);
        }

        await ensureLoggedIn();

        const fdate1 = '2026-01-01 00:00:00';
        const fdate2 = moment().tz("Asia/Karachi").format('YYYY-MM-DD 23:59:59');

        const params = new URLSearchParams({
            fdate1,
            fdate2,
            iDisplayLength: -1,
            _: Date.now()
        });

        const response = await client.get(`${DATA_URL}?${params.toString()}`, {
            headers: {
                Referer: `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        let data;
        try {
            data = JSON.parse(response.body);
        } catch {
            return res.status(502).json({ error: 'Invalid JSON from panel' });
        }

        cachedNumberData = data;
        lastFetchTime = now;
        res.json(data);

    } catch (e) {
        console.error('❌ Numbers error:', e.message);
        res.status(500).json({ error: 'Failed to fetch number stats' });
    }
});

// ---------- SMS ----------
app.get('/api/sms', async (req, res) => {
    try {
        const response = await got.get(SMS_API_URL, {
            timeout: { request: 15000 },
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json,text/plain,*/*'
            }
        });

        let rawData;
        try {
            rawData = JSON.parse(response.body);
        } catch {
            return res.status(502).json({ error: 'Upstream SMS API returned invalid JSON' });
        }

        const formatted = rawData.map(item => ([
            item[3],
            getCountryFromNumber(item[1]),
            item[1],
            item[0],
            item[2],
            "$",
            "€",
            0.005
        ]));

        formatted.push([
            "0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9",
            0, 0, 0, "", "$", 0, 0
        ]);

        res.json({
            sEcho: 1,
            iTotalRecords: formatted.length.toString(),
            iTotalDisplayRecords: formatted.length.toString(),
            aaData: formatted
        });

    } catch (e) {
        console.error('❌ SMS error:', e.message);
        res.status(500).json({ error: 'Failed to fetch SMS data' });
    }
});

// ================= START =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
