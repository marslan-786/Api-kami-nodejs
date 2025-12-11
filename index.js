const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION ---
const CREDENTIALS = {
    username: "Kami522",
    password: "Kami526"
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `${BASE_URL}/client/SMSCDRStats`,
    "Origin": "http://51.89.99.105"
};

// URLs
const URL_NUMBERS_BASE = "http://51.89.99.105/NumberPanel/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1";
const URL_OTP_BASE = "http://51.89.99.105/NumberPanel/client/res/data_smscdr.php?fdate1=2025-12-11%2000:00:00&fdate2=2025-12-11%2023:59:59&frange=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgnumber=&fgcli=&fg=0&sesskey=Q05RRkJQUEJCVQ==&sEcho=2&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=desc&iSortingCols=1";

const COOKIE_FILE = path.join(__dirname, 'session_cookie.txt');
let cachedCookie = "PHPSESSID=jfogu3u27tvo7p2fdkt8tfs4k8"; // Default Initial

// --- SESSION MANAGER ---

// Load cookie from file on startup
if (fs.existsSync(COOKIE_FILE)) {
    try {
        const saved = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
        if (saved) {
            cachedCookie = saved;
            console.log("📂 Loaded Cookie:", cachedCookie);
        }
    } catch (e) { console.error("Cookie Load Error:", e); }
}

function saveCookie(cookie) {
    cachedCookie = cookie;
    fs.writeFileSync(COOKIE_FILE, cookie);
}

async function performLogin() {
    console.log("🔄 System: Logging in...");
    try {
        // Create instance
        const instance = axios.create({ 
            withCredentials: true, 
            headers: HEADERS,
            timeout: 10000 
        });

        // 1. Get Page
        const r1 = await instance.get(`${BASE_URL}/login`);
        
        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const c = r1.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (c) tempCookie = c.split(';')[0];
        }

        const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
        if (!match) {
            console.log("❌ Captcha Not Found");
            return false;
        }

        const ans = parseInt(match[1]) + parseInt(match[2]);
        
        // 2. Post Data
        const params = new URLSearchParams();
        params.append('username', CREDENTIALS.username);
        params.append('password', CREDENTIALS.password);
        params.append('capt', ans);

        const r2 = await instance.post(`${BASE_URL}/signin`, params, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": tempCookie,
                "Referer": `${BASE_URL}/login`
            },
            maxRedirects: 0,
            validateStatus: () => true
        });

        // Check new cookie
        if (r2.headers['set-cookie']) {
            const newC = r2.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (newC) {
                saveCookie(newC.split(';')[0]);
                console.log("✅ Login Success:", cachedCookie);
                return true;
            }
        }
        
        if (tempCookie) {
            saveCookie(tempCookie);
            console.log("✅ Login Success (Initial Cookie):", cachedCookie);
            return true;
        }

        return false;

    } catch (e) {
        console.error("Login Error:", e.message);
        return false;
    }
}

// --- KEEP ALIVE LOOP ---
setInterval(async () => {
    try {
        const ts = Date.now();
        // Ping OTP url to keep session active (Lightweight check)
        const checkUrl = `${URL_OTP_BASE}&_=${ts}`;
        
        const r = await axios.get(checkUrl, {
            headers: { ...HEADERS, "Cookie": cachedCookie },
            timeout: 5000,
            responseType: 'text' // Don't parse JSON to save CPU
        });

        if (typeof r.data === 'string' && (r.data.includes('login') || r.data.includes('Direct Script'))) {
            console.log("⚠️ Background: Session Dead. Logging in...");
            await performLogin();
        }
    } catch (e) {
        // Silent fail
    }
}, 30000); // Every 30 seconds

// --- API SERVER ---

app.get('/', (req, res) => res.send("🚀 Fast Node.js API on Railway!"));

app.get('/api', async (req, res) => {
    const { type } = req.query;
    const ts = Date.now();

    let targetUrl = "";
    if (type === 'number') targetUrl = `${URL_NUMBERS_BASE}&_=${ts}`;
    else if (type === 'sms') targetUrl = `${URL_OTP_BASE}&_=${ts}`;
    else return res.status(400).json({ error: "Invalid type" });

    try {
        // 🚀 SUPER FAST REQUEST
        const response = await axios.get(targetUrl, {
            headers: { ...HEADERS, "Cookie": cachedCookie },
            responseType: 'arraybuffer', // Raw Binary Data (Fastest)
            timeout: 20000
        });

        // Check for login error in the raw buffer (First 100 bytes is enough)
        const startOfData = response.data.subarray(0, 500).toString('utf-8');
        
        if (startOfData.includes('<html') || startOfData.includes('login')) {
            console.log("⚠️ Session Expired during request. Refreshing...");
            await performLogin();
            // Retry once
            const retry = await axios.get(targetUrl, {
                headers: { ...HEADERS, "Cookie": cachedCookie },
                responseType: 'arraybuffer',
                timeout: 20000
            });
            res.set('Content-Type', 'application/json');
            return res.send(retry.data);
        }

        // Direct Pipe Output (Raw Speed)
        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initial login attempt on start
    if (!fs.existsSync(COOKIE_FILE)) performLogin();
});
