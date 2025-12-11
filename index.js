const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CONFIGURATION ---
const CREDENTIALS = {
    username: "Kami522",
    password: "Kami526"
};

const BASE_URL = "http://51.89.99.105/NumberPanel";
const DASHBOARD_URL = `${BASE_URL}/client/SMSCDRStats`; // یہاں سے SessKey ملے گی

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "http://51.89.99.105"
};

// --- GLOBAL STATE (میموری میں ڈیٹا محفوظ رہے گا) ---
let STATE = {
    cookie: null,
    sessKey: null,
    isLoggingIn: false
};

// --- 1. LOGIN & KEY EXTRACTOR ---
async function performLogin() {
    if (STATE.isLoggingIn) return; // اگر پہلے سے لاگ ان ہو رہا ہے تو رک جائیں
    STATE.isLoggingIn = true;
    
    console.log("🔄 System: Starting Fresh Login Process...");

    try {
        const instance = axios.create({ 
            withCredentials: true, 
            headers: HEADERS,
            timeout: 10000 
        });

        // Step A: Get Login Page & Cookie
        const r1 = await instance.get(`${BASE_URL}/login`);
        
        let tempCookie = "";
        if (r1.headers['set-cookie']) {
            const c = r1.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (c) tempCookie = c.split(';')[0];
        }

        // Step B: Solve Captcha
        const match = r1.data.match(/What is (\d+) \+ (\d+) = \?/);
        if (!match) throw new Error("Captcha Not Found");
        
        const ans = parseInt(match[1]) + parseInt(match[2]);

        // Step C: Post Login
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

        // Step D: Save Final Cookie
        let finalCookie = tempCookie;
        if (r2.headers['set-cookie']) {
            const newC = r2.headers['set-cookie'].find(x => x.includes('PHPSESSID'));
            if (newC) finalCookie = newC.split(';')[0];
        }
        
        STATE.cookie = finalCookie;
        console.log("✅ Login Success! Cookie:", finalCookie);

        // Step E: Fetch Dashboard to get SessKey
        // لاگ ان کے فوراً بعد ڈیش بورڈ کال کریں تاکہ SessKey مل جائے
        const r3 = await axios.get(DASHBOARD_URL, {
            headers: { ...HEADERS, "Cookie": STATE.cookie }
        });

        const keyMatch = r3.data.match(/sesskey=([a-zA-Z0-9%]+==?)/) || r3.data.match(/sesskey":"([a-zA-Z0-9%]+==?)"/);
        
        if (keyMatch && keyMatch[1]) {
            STATE.sessKey = keyMatch[1];
            console.log("🔑 SessKey Extracted:", STATE.sessKey);
        } else {
            console.log("⚠️ Could not extract SessKey, using default/old one if available.");
        }

    } catch (e) {
        console.error("❌ Login Failed:", e.message);
    } finally {
        STATE.isLoggingIn = false;
    }
}

// --- 2. KEEP ALIVE (PING) ---
// یہ فنکشن ہر 1 منٹ بعد سرور کو پنگ کرے گا تاکہ سیشن زندہ رہے
setInterval(async () => {
    if (!STATE.cookie || !STATE.sessKey) return;

    try {
        const ts = Date.now();
        // ہم ایک ہلکی API کو کال کرتے ہیں تاکہ سیشن ایکٹو رہے
        // نوٹ: ہم ڈیٹا پروسیس نہیں کر رہے، بس کنکشن بنا رہے ہیں
        await axios.get(`${BASE_URL}/client/res/data_smscdr.php?check=ping&_=${ts}`, {
            headers: { ...HEADERS, "Cookie": STATE.cookie },
            timeout: 5000
        });
        // console.log("💓 Ping sent to keep session alive.");
    } catch (e) {
        // Silent fail
    }
}, 60000); // 60 Seconds

// --- 3. API HANDLER ---

app.get('/', (req, res) => res.send("🚀 Railway API with Permanent Session!"));

app.get('/api', async (req, res) => {
    const { type } = req.query;
    
    // اگر سیشن نہیں ہے تو پہلے لاگ ان کریں
    if (!STATE.cookie || !STATE.sessKey) {
        await performLogin();
    }

    const ts = Date.now();
    let targetUrl = "";

    // Dynamic URL Generation using stored SessKey
    if (type === 'number') {
        targetUrl = `${BASE_URL}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;
    } else if (type === 'sms') {
        targetUrl = `${BASE_URL}/client/res/data_smscdr.php?fdate1=2025-12-11%2000:00:00&fdate2=2025-12-11%2023:59:59&frange=&fnum=&fcli=&fgdate=&fgmonth=&fgrange=&fgnumber=&fgcli=&fg=0&sesskey=${STATE.sessKey}&sEcho=2&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=desc&iSortingCols=1&_=${ts}`;
    } else {
        return res.status(400).json({ error: "Invalid type" });
    }

    try {
        // Fast Request (Binary Mode)
        let response = await axios.get(targetUrl, {
            headers: { ...HEADERS, "Cookie": STATE.cookie },
            responseType: 'arraybuffer', 
            timeout: 25000
        });

        // Check if session expired (HTML received instead of JSON)
        // ہم ڈیٹا کے شروع کے 500 بائٹس چیک کرتے ہیں
        const checkData = response.data.subarray(0, 500).toString();

        if (checkData.includes('<html') || checkData.includes('login') || checkData.includes('Direct Script')) {
            console.log("⚠️ Session Expired (HTML received). Re-logging...");
            
            // Re-login
            await performLogin();

            // لنک دوبارہ بنائیں (کیونکہ sessKey بدل گئی ہوگی)
            if (type === 'sms') {
                targetUrl = targetUrl.replace(/sesskey=([^&]+)/, `sesskey=${STATE.sessKey}`);
            }

            // Retry Request
            response = await axios.get(targetUrl, {
                headers: { ...HEADERS, "Cookie": STATE.cookie },
                responseType: 'arraybuffer',
                timeout: 25000
            });
        }

        // Send Raw JSON (Super Fast)
        res.set('Content-Type', 'application/json');
        res.send(response.data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server & Initial Login
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    performLogin(); // ایپ چلتے ہی پہلا لاگ ان کر لے
});
