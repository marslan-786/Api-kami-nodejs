const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION (UPDATED FOR AGENT) ---
const CREDENTIALS = {
    username: "Kami526",  // New Agent Username
    password: "Kamran52"  // New Agent Password
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
// Agent Dashboard URL for SessKey extraction
const DASHBOARD_URL = `${BASE_URL}/agent/SMSDashboard`; 

const COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "http://51.89.99.105",
    "Accept-Language": "en-US,en;q=0.9,ur-PK;q=0.8,ur;q=0.7"
};

// --- GLOBAL STATE ---
let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false,
    lastUpdate: 0
};

// --- HELPER: GET CURRENT DATE (YYYY-MM-DD) ---
function getTodayDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- HELPER: FIND KEY IN HTML ---
function extractKey(html) {
    let match = html.match(/sesskey=([^&"']+)/);
    if (match) return match[1];

    match = html.match(/sesskey\s*[:=]\s*["']([^"']+)["']/);
    if (match) return match[1];

    match = html.match(/sesskey":"([^"]+)"/);
    if (match) return match[1];

    return null;
}

// --- 1. LOGIN & EXTRACTOR ---
async function performLogin() {
    if (STATE.isLoggingIn) return;
    STATE.isLoggingIn = true;
    
    console.log("🔄 System: Starting Agent Login Process...");

    try {
        const instance = axios.create({ 
            withCredentials: true, 
            headers: COMMON_HEADERS,
            timeout: 15000
        });

        // A. Get Login Page
        const r1 = await instance.get(`${BASE_URL}/login`);
        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const c = r1.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (c) tempCookie = c.split(';')[0];
        }

        // B. Solve Captcha
        const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
        if (!match) throw new Error("Captcha Not Found");
        
        const ans = parseInt(match[1]) + parseInt(match[2]);
        console.log(`🧩 Captcha Solved: ${match[1]} + ${match[2]} = ${ans}`);

        // C. Post Login
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

        // D. Save Cookie
        if (r2.headers['set-cookie']) {
            const newC = r2.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (newC) STATE.cookie = newC.split(';')[0];
        } else {
            STATE.cookie = tempCookie;
        }
        
        console.log("✅ Agent Login Success. Cookie:", STATE.cookie);

        // E. EXTRACT SESSKEY (From Agent Dashboard)
        console.log("🕵️ Hunting for SessKey on Agent Dashboard...");
        
        const r3 = await axios.get(DASHBOARD_URL, {
            headers: { ...COMMON_HEADERS, "Cookie": STATE.cookie },
            timeout: 15000
        });

        const foundKey = extractKey(r3.data);
        
        if (foundKey) {
            STATE.sessKey = foundKey;
            STATE.lastUpdate = Date.now();
            console.log("🔥 SessKey FOUND:", STATE.sessKey);
        } else {
            console.log("❌ CRITICAL: SessKey NOT found in Agent HTML. Check Logs.");
            // console.log("HTML Snippet:", r3.data.substring(0, 500)); 
        }

    } catch (e) {
        console.error("❌ Login/Extraction Failed:", e.message);
    } finally {
        STATE.isLoggingIn = false;
    }
}

// --- 2. AUTO REFRESHER ---
setInterval(() => {
    performLogin();
}, 120000); 

// --- 3. API SERVER ---

app.get('/', (req, res) => res.send(`🚀 Agent API Running.<br>Cookie: ${STATE.cookie}<br>SessKey: ${STATE.sessKey}`));

app.get('/api', async (req, res) => {
    const { type } = req.query;
    
    if (!STATE.cookie || !STATE.sessKey) {
        await performLogin();
        if (!STATE.sessKey) return res.status(500).json({error: "Server Error: Could not fetch SessKey"});
    }

    const ts = Date.now();
    const today = getTodayDate(); // e.g. 2025-12-12
    let targetUrl = "";
    let specificReferer = "";

    // --- AGENT URL CONSTRUCTION ---
    if (type === 'number') {
        // Agent Number URL (Notice: data_smsnumbers2.php)
        // Referer: .../agent/MySMSNumbers2
        specificReferer = `${BASE_URL}/agent/MySMSNumbers2`;
        targetUrl = `${BASE_URL}/agent/res/data_smsnumbers2.php?frange=&fclient=&fallocated=&sEcho=2&iColumns=8&sColumns=%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=false&bSortable_0=false&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=false&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=false&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=false&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=false&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=false&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=false&bSortable_7=false&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
    
    } else if (type === 'sms') {
        // Agent SMS URL (Notice: 9 columns instead of 7)
        // Referer: .../agent/SMSCDRReports
        specificReferer = `${BASE_URL}/agent/SMSCDRReports`;
        targetUrl = `${BASE_URL}/agent/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&frange=&fclient=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgclient=&fgnumber=&fgcli=&fg=0&sesskey=${STATE.sessKey}&sEcho=2&iColumns=9&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=false&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=desc&iSortingCols=1&_=${ts}`;
    
    } else {
        return res.status(400).json({ error: "Invalid type. Use ?type=sms or ?type=number" });
    }

    try {
        console.log(`📡 Fetching Agent Data: ${type}`);
        
        const response = await axios.get(targetUrl, {
            headers: { 
                ...COMMON_HEADERS, 
                "Cookie": STATE.cookie,
                "Referer": specificReferer // Important for Agent panel
            },
            responseType: 'arraybuffer', 
            timeout: 25000
        });

        // Validate Response
        const checkData = response.data.subarray(0, 1000).toString();
        
        if (checkData.includes('<html') || checkData.includes('login')) {
            console.log("⚠️ Session Expired. Re-logging in...");
            await performLogin();
            return res.status(503).send("Session Refreshed. Please retry.");
        }

        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Start & Login
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    performLogin();
});
