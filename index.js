const express = require('express');
const axios = require('axios');
const { wrapper } = require('axios-cookie-jar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');

const app = express();

const PORT = process.env.PORT || 3000;

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;
const SMS_API_URL = 'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

let cachedNumberData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

async function ensureLoggedIn() {
    try {
        console.log('Fetching Login Page...');
        const loginPage = await client.get(LOGIN_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
            }
        });

        const $ = cheerio.load(loginPage.data);
        const labelText = $('label:contains("What is")').text();
        const match = labelText.match(/(\d+)\s*\+\s*(\d+)/);
        
        let captchaAnswer = 0;
        if (match) {
            captchaAnswer = parseInt(match[1]) + parseInt(match[2]);
            console.log(`Captcha Solved: ${match[1]} + ${match[2]} = ${captchaAnswer}`);
        }

        console.log('Logging in...');
        const params = new URLSearchParams();
        params.append('username', USERNAME);
        params.append('password', PASSWORD);
        params.append('capt', captchaAnswer);

        await client.post(SIGNIN_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': LOGIN_URL,
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
            }
        });
        console.log('Login successful.');
        
    } catch (error) {
        console.error('Login Failed:', error.message);
    }
}


app.get('/', (req, res) => {
    res.send('Number Panel Proxy is Running on Railway!');
});

app.get('/api/numbers', async (req, res) => {
    try {
        const currentTime = Date.now();

        if (cachedNumberData && (currentTime - lastFetchTime < CACHE_DURATION)) {
            console.log('Serving Cached Data');
            return res.json(cachedNumberData);
        }

        console.log('Cache Expired. Fetching fresh data...');
        await ensureLoggedIn();

        const fdate1 = '2026-01-01 00:00:00';
        const fdate2 = moment().tz("Asia/Karachi").format('YYYY-MM-DD 23:59:59');

        const params = new URLSearchParams({
            fdate1: fdate1,
            fdate2: fdate2,
            sEcho: 4, iColumns: 5, sColumns: ',,,,',
            iDisplayStart: 0, iDisplayLength: -1,
            sSearch: '', bRegex: false, iSortCol_0: 0,
            sSortDir_0: 'desc', iSortingCols: 1,
            _: Date.now()
        });

        const response = await client.get(`${DATA_URL}?${params.toString()}`, {
            headers: {
                'Referer': `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        cachedNumberData = response.data;
        lastFetchTime = currentTime;
        res.json(cachedNumberData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch number stats' });
    }
});

app.get('/api/sms', async (req, res) => {
    try {
        const response = await axios.get(SMS_API_URL);
        const rawData = response.data;

        const formattedData = rawData.map(item => {
            return [
                item[3],                          // Date
                "Burundi-Ecno-KM-Auto",           // Country
                item[1],                          // Phone
                item[0],                          // Service
                "Kami527",                        // User
                item[2],                          // Message
                "$",                              // Currency
                0.012,                            // Price
                0                                 // Flag
            ];
        });

        res.json({
            "sEcho": 1,
            "iTotalRecords": formattedData.length,
            "iTotalDisplayRecords": formattedData.length,
            "aaData": formattedData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch SMS data' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
