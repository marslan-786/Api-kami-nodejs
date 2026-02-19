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
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE_URL
};

let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false
};

function extractKey(html) {
    let match = html.match(/sesskey=([^&"']+)/);
    if (match) return match[1];
    return null;
}

async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;

    try {
        console.log("🔄 Logging in...");

        const r1 = await axios.get(`${BASE_URL}/login`);
        let cookie = r1.headers["set-cookie"][0].split(";")[0];

        const match = r1.data.match(/What is (\d+) \+ (\d+)/);
        const ans = parseInt(match[1]) + parseInt(match[2]);

        const params = new URLSearchParams();
        params.append("username", CREDENTIALS.username);
        params.append("password", CREDENTIALS.password);
        params.append("capt", ans);

        const r2 = await axios.post(`${BASE_URL}/signin`, params, {
            headers: { Cookie: cookie }
        });

        if (r2.headers["set-cookie"]) {
            cookie = r2.headers["set-cookie"][0].split(";")[0];
        }

        STATE.cookie = cookie;

        const r3 = await axios.get(STATS_PAGE_URL, {
            headers: { Cookie: STATE.cookie }
        });

        STATE.sessKey = extractKey(r3.data);

        console.log("✅ Login Success | SessKey:", STATE.sessKey);

    } catch (e) {
        console.log("❌ Login Failed:", e.message);
    } finally {
        STATE.isLoggingIn = false;
    }
}

app.get("/api", async (req, res) => {
    const { type } = req.query;

    if (!STATE.cookie || !STATE.sessKey) {
        await performLogin();
    }

    const ts = Date.now();
    let targetUrl = "";
    let referer = "";

    // ===== NUMBERS =====
    if (type === "numbers") {

        referer = `${BASE_URL}/client/MySMSNumbers`;
        targetUrl = `${BASE_URL}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;

    }
    // ===== SMS =====
    else if (type === "sms") {

        referer = `${BASE_URL}/client/SMSCDRStats`;
        targetUrl = `${BASE_URL}/client/res/data_smscdr.php?fdate1=2026-02-19%2000:00:00&fdate2=2099-12-31%2023:59:59&frange=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgnumber=&fgcli=&fg=0&sesskey=${STATE.sessKey}&sEcho=2&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=desc&iSortingCols=1&_=${ts}`;

    } else {
        return res.json({ error: "Invalid type" });
    }

    try {

        const response = await axios.get(targetUrl, {
            headers: {
                ...COMMON_HEADERS,
                Cookie: STATE.cookie,
                Referer: referer
            },
            responseType: "arraybuffer"
        });

        const check = response.data.subarray(0, 1000).toString();

        // 🔥 AUTO REL0GIN WHEN EXPIRED
        if (check.includes("<html") || check.includes("login")) {

            console.log("⚠️ SessKey expired → ReLogin");

            STATE.cookie = null;
            STATE.sessKey = null;

            await performLogin();

            return res.redirect(req.originalUrl);
        }

        res.set("Content-Type", "application/json");
        res.send(response.data);

    } catch (e) {
        res.json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log("🚀 Server Running");
    await performLogin();
});
