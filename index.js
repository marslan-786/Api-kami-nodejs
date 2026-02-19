const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

const CREDENTIALS = {
    username: "Kami555",
    password: "Kami526"
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
const STATS_PAGE_URL = `${BASE_URL}/client/SMSCDRStats`;

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android)",
    "X-Requested-With": "XMLHttpRequest"
};

let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function extractKey(html) {
    let m = html.match(/sesskey=([^&"']+)/);
    if (m) return m[1];
    return null;
}

async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;

    try {
        console.log("🔄 Logging in...");

        const r1 = await axios.get(`${BASE_URL}/login`, { headers: COMMON_HEADERS });

        const cookie = r1.headers['set-cookie']
            ?.find(c => c.includes("PHPSESSID"))
            ?.split(';')[0];

        STATE.cookie = cookie;

        const match = r1.data.match(/What is (\d+) \+ (\d+)/);
        const ans = match ? Number(match[1]) + Number(match[2]) : 10;

        const params = new URLSearchParams();
        params.append('username', CREDENTIALS.username);
        params.append('password', CREDENTIALS.password);
        params.append('capt', ans);

        await axios.post(`${BASE_URL}/signin`, params, {
            headers: {
                ...COMMON_HEADERS,
                Cookie: STATE.cookie,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        const r3 = await axios.get(STATS_PAGE_URL, {
            headers: { ...COMMON_HEADERS, Cookie: STATE.cookie }
        });

        const key = extractKey(r3.data);

        if (key) {
            STATE.sessKey = key;
            console.log("🔥 SessKey:", key);
        }

    } catch (e) {
        console.log("❌ Login Error:", e.message);
        STATE.cookie = null;
        STATE.sessKey = null;
    }

    STATE.isLoggingIn = false;
}

// Keep session alive
setInterval(() => {
    if (!STATE.sessKey) performLogin();
}, 30000);

// ================= MAIN API =================
app.get('/api', async (req, res) => {
    const { type } = req.query;

    // WAIT UNTIL LOGIN READY
    while (!STATE.cookie || !STATE.sessKey) {
        console.log("⏳ Waiting login...");
        await performLogin();
        await sleep(2000);
    }

    let url, referer;

    if (type === "numbers") {
        referer = `${BASE_URL}/client/MySMSNumbers`;
        url = `${BASE_URL}/client/res/data_smsnumbers.php?iDisplayLength=-1&_=${Date.now()}`;
    }
    else if (type === "sms") {
        referer = `${BASE_URL}/client/SMSCDRStats`;
        const today = new Date().toISOString().split("T")[0];
        url = `${BASE_URL}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${STATE.sessKey}&iDisplayLength=50&_=${Date.now()}`;
    }
    else return res.json({ error: "Use ?type=sms or ?type=numbers" });

    try {
        const r = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                Cookie: STATE.cookie,
                Referer: referer
            },
            responseType: "arraybuffer"
        });

        const txt = r.data.toString();

        if (txt.includes("login") || txt.includes("<html")) {
            console.log("⚠️ Session expired");
            STATE.sessKey = null;
            return res.json({ error: "Session expired retry" });
        }

        const json = JSON.parse(txt);

        // 🔥 NEW SMS FIRST
        if (type === "sms" && json.aaData) {
            json.aaData.reverse();
        }

        res.json(json);

    } catch (e) {
        STATE.sessKey = null;
        res.json({ error: "Auto retry login" });
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log("🚀 Server Running");
    performLogin();
});
