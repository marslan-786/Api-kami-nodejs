const express = require('express');
const got = require('got'); 
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

const cookieJar = new CookieJar();
const client = got.extend({
    cookieJar,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
    },
    retry: {
        limit: 2 
    }
});

const TARGET_HOST = 'http://51.89.99.105';
const LOGIN_URL = `${TARGET_HOST}/NumberPanel/login`;
const SIGNIN_URL = `${TARGET_HOST}/NumberPanel/signin`;
const DATA_URL = `${TARGET_HOST}/NumberPanel/agent/res/data_smsnumberstats.php`;
const SMS_API_URL = 'http://147.135.212.197/crapi/st/viewstats?token=RVVUSkVBUzRHaothilCXX2KEa4FViFFBa5CVQWaYmGJbjVdaX2x4Vg==&records=50';

const USERNAME = process.env.PANEL_USER || 'Kami526';
const PASSWORD = process.env.PANEL_PASS || 'Kamran52';

let cachedNumberData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; 

// --- Helper Functions ---

function getCountryFromNumber(number) {
    if (!number) return "International";
    try {
        const strNum = number.toString().startsWith('+') ? number.toString() : '+' + number.toString();
        const phoneNumber = parsePhoneNumber(strNum);

        if (phoneNumber && phoneNumber.country) {
            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            return regionNames.of(phoneNumber.country);
        }
        return "International";
    } catch (error) {
        return "International";
    }
}

// SMS Message Fixer
function fixSmsMessage(msg) {
    if (!msg) return "";
    // Logic: 0-9 k baad agar 'n' aye to Space laga do
    let fixedMsg = msg.replace(/(\d)n/g, '$1 ');
    fixedMsg = fixedMsg.replace(/\n/g, ' ');
    return fixedMsg;
}

async function ensureLoggedIn() {
    try {
        const loginPage = await client.get(LOGIN_URL);
        const $ = cheerio.load(loginPage.body);
        const labelText = $('label:contains("What is")').text();
        const match = labelText.match(/(\d+)\s*\+\s*(\d+)/);
        let captchaAnswer = 0;
        if (match) captchaAnswer = parseInt(match[1]) + parseInt(match[2]);

        await client.post(SIGNIN_URL, {
            form: { username: USERNAME, password: PASSWORD, capt: captchaAnswer },
            headers: { 'Referer': LOGIN_URL }
        });
    } catch (error) {
        console.error('Login Failed:', error.message);
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    res.send('Number Panel Proxy is Running!');
});

// 1. Numbers API (Updated to Kenya Structure)
app.get('/api/numbers', async (req, res) => {
    try {
        const currentTime = Date.now();
        if (cachedNumberData && (currentTime - lastFetchTime < CACHE_DURATION)) {
            return res.json(cachedNumberData);
        }

        await ensureLoggedIn();

        const fdate1 = '2026-01-01 00:00:00';
        const fdate2 = moment().tz("Asia/Karachi").format('YYYY-MM-DD 23:59:59');

        const searchParams = new URLSearchParams({
            fdate1: fdate1, fdate2: fdate2, sEcho: 4, iColumns: 5, sColumns: ',,,,',
            iDisplayStart: 0, iDisplayLength: -1, sSearch: '', bRegex: false, iSortCol_0: 0, sSortDir_0: 'desc', iSortingCols: 1, _: Date.now()
        });

        const response = await client.get(`${DATA_URL}?${searchParams.toString()}`, {
            headers: { 'Referer': `${TARGET_HOST}/NumberPanel/agent/SMSNumberStats`, 'X-Requested-With': 'XMLHttpRequest' },
            responseType: 'json' 
        });

        const rawData = response.body;

        // **TRANSFORMATION FOR NUMBERS API** (Matches Kenya JSON Structure)
        if (rawData.aaData && Array.isArray(rawData.aaData)) {
            rawData.aaData = rawData.aaData.map(item => {
                // Raw Input: ["584269902694", "1", "$", 0.01, 0]
                
                const number = item[0];
                const countryName = getCountryFromNumber(number);
                const currency = item[2];
                const price = item[3];
                
                // Constructing 6 Columns
                return [
                    countryName,                            // 0: Name/Country
                    "",                                     // 1: Empty (Hidden ID)
                    number,                                 // 2: Phone Number
                    "OTP",                                  // 3: Period/Type (Hardcoded as OTP)
                    `${currency} ${price}`,                 // 4: Price (e.g. $ 0.01)
                    "SD : <b>0</b> | SW : <b>0</b> "        // 5: Actions (Hardcoded Visuals)
                ];
            });
        }

        cachedNumberData = rawData;
        lastFetchTime = currentTime;
        res.json(cachedNumberData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed' });
    }
});

// 2. SMS API (Original Structure + Message Fix)
app.get('/api/sms', async (req, res) => {
    try {
        // Simple Error Handling added here
        let response;
        try {
            response = await got.get(SMS_API_URL, { responseType: 'json' });
        } catch (err) {
            console.error("SMS API Error (External):", err.message);
            // Return empty structure if external API fails (to prevent crash)
            return res.json({ "sEcho": 1, "iTotalRecords": 0, "iTotalDisplayRecords": 0, "aaData": [] });
        }

        const rawData = response.body;

        const formattedData = rawData.map(item => {
            const cleanMessage = fixSmsMessage(item[2]);
            const country = getCountryFromNumber(item[1]);

            // **Original Order:** Date -> Country -> Phone -> Service -> Message...
            return [
                item[3],        // 0. Date
                country,        // 1. Country
                item[1],        // 2. Phone
                item[0],        // 3. Service
                cleanMessage,   // 4. Message (Fixed 'n' issue)
                "$",            // 5. Currency
                "0.005",        // 6. Price
                ""              // 7. Extra
            ];
        });

        formattedData.push([ "0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9", 0, 0, 0, "", "$", 0, 0 ]);

        res.json({
            "sEcho": 1,
            "iTotalRecords": formattedData.length.toString(),
            "iTotalDisplayRecords": formattedData.length.toString(),
            "aaData": formattedData
        });

    } catch (error) {
        console.error('Error fetching SMS logic:', error.message);
        res.status(500).json({ error: 'Failed to fetch SMS data' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
