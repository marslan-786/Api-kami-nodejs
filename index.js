const express = require("express");
const axios = require("axios");
const qs = require("querystring");

const app = express();

const BASE = "http://51.89.99.105/NumberPanel";

const PANEL = {
  username: "Kami555",
  password: "Kami526"
};

let cookies = "";
let sesskey = "";
let isLoggingIn = false;

// ---------------- HELPERS ----------------
function getCountryFromNumber(number) {
  // Simple placeholder, agar phonenumbers library use karna ho to replace karo
  if (!number) return "Unknown";
  if (number.startsWith("60")) return "Malaysia";
  if (number.startsWith("84")) return "Vietnam";
  return "Unknown";
}

// ---------------- LOGIN ----------------
async function login() {
  if (isLoggingIn) return;
  isLoggingIn = true;

  try {
    const res = await axios.get(BASE + "/login");
    cookies = res.headers["set-cookie"].join(";");

    const match = res.data.match(/What is (\d+) \+ (\d+)/);
    const ans = match ? Number(match[1]) + Number(match[2]) : 10;

    await axios.post(
      BASE + "/signin",
      qs.stringify({ username: PANEL.username, password: PANEL.password, capt: ans }),
      { headers: { Cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const stats = await axios.get(BASE + "/client/SMSCDRStats", { headers: { Cookie: cookies } });
    const key = stats.data.match(/sesskey=([^&"]+)/);
    if (key) sesskey = key[1];

    console.log("✅ Login OK, SessKey:", sesskey);
  } catch (e) {
    console.log("❌ Login Error:", e.message);
  } finally {
    isLoggingIn = false;
  }
}

// ---------------- FETCH NUMBERS ----------------
async function fetchNumbers() {
  try {
    if (!sesskey) await login();

    const url = `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&_=${Date.now()}`;
    const res = await axios.get(url, { headers: { Cookie: cookies, "X-Requested-With": "XMLHttpRequest" } });

    const rawData = res.data;

    if (!rawData.aaData || !Array.isArray(rawData.aaData))
      return { sEcho: 2, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };

    return {
      sEcho: rawData.sEcho || 2,
      iTotalRecords: rawData.iTotalRecords || rawData.aaData.length,
      iTotalDisplayRecords: rawData.iTotalDisplayRecords || rawData.aaData.length,
      aaData: rawData.aaData
    };
  } catch (e) {
    sesskey = "";
    return { sEcho: 2, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };
  }
}

// ---------------- FETCH SMS ----------------
const seenSMS = new Set();

async function fetchSMS() {
  try {
    if (!sesskey) await login();

    const today = new Date().toISOString().split("T")[0];
    const url = `${BASE}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;

    const res = await axios.get(url, { headers: { Cookie: cookies, "X-Requested-With": "XMLHttpRequest" } });
    const rawData = res.data;

    if (!rawData.aaData || !Array.isArray(rawData.aaData))
      return { sEcho: 2, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };

    rawData.aaData = rawData.aaData
      .filter(item => item[2] && item[4]) // valid number & message
      .filter(item => {
        const id = item[0] + item[2] + item[4];
        if (seenSMS.has(id)) return false;
        seenSMS.add(id);
        return true;
      })
      .map(item => {
        const number = item[2];
        const countryName = getCountryFromNumber(number);

        return [
          countryName,             // 0
          "",                      // 1
          number,                  // 2
          "OTP",                   // 3
          "$ 0",                   // 4 placeholder
          "SD : <b>0</b> | SW : <b>0</b>" // 5
        ];
      });

    return {
      sEcho: 2,
      iTotalRecords: rawData.aaData.length,
      iTotalDisplayRecords: rawData.aaData.length,
      aaData: rawData.aaData.reverse() // newest first
    };

  } catch (e) {
    sesskey = "";
    return { sEcho: 2, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };
  }
}

// ---------------- API ----------------
app.get("/api", async (req, res) => {
  const { type } = req.query;

  if (type === "numbers") {
    const data = await fetchNumbers();
    res.json(data);
  } else if (type === "sms") {
    const data = await fetchSMS();
    res.json(data);
  } else {
    res.status(400).json({ error: "Invalid type. Use ?type=numbers or ?type=sms" });
  }
});

// ---------------- START ----------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 Running on port", PORT);
  await login();
});
