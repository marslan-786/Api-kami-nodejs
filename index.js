const express = require("express");
const axios = require("axios");
const qs = require("querystring");

const app = express();
const BASE = "http://51.89.99.105/NumberPanel";

const PANEL = { username: "Kami555", password: "Kami526" };

// Global state
let cookies = "";
let sesskey = "";
let isLoggingIn = false;
const seenSMS = new Set();

// ================= HELPERS =================
function fixSmsMessage(text) {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").trim();
}

function getCountryFromNumber(number) {
  if (!number) return "Unknown";
  if (number.startsWith("601")) return "Malaysia";
  if (number.startsWith("84")) return "Vietnam";
  return "Unknown";
}

// ================= LOGIN =================
async function login() {
  if (isLoggingIn) return;
  isLoggingIn = true;
  try {
    const res = await axios.get(BASE + "/login");
    cookies = res.headers["set-cookie"]?.join(";") || "";

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

    console.log("✅ Login OK");
  } catch (e) {
    console.log("❌ Login Error:", e.message);
  } finally {
    isLoggingIn = false;
  }
}

// ================= FETCH SMS =================
async function fetchSMS() {
  try {
    if (!sesskey) await login();

    const today = new Date().toISOString().split("T")[0];
    const url = `${BASE}/client/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;

    const res = await axios.get(url, {
      headers: { Cookie: cookies, "X-Requested-With": "XMLHttpRequest" }
    });

    const rawData = res.data.aaData || [];
    const formattedData = rawData
      .filter(item => item[2] && item[4])
      .filter(item => {
        const id = item[0] + item[1] + item[4];
        if (seenSMS.has(id)) return false;
        seenSMS.add(id);
        return true;
      })
      .map(item => [
        item[3],            // 0. Date
        getCountryFromNumber(item[1]), // 1. Country
        item[1],            // 2. Phone
        item[0],            // 3. Service
        fixSmsMessage(item[2]), // 4. Message
        "$",                // 5 Currency
        "0.005",            // 6 Price
        ""                  // 7 Extra
      ]);

    return formattedData.reverse(); // newest first
  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= API =================
app.get("/api", async (req, res) => {
  const type = req.query.type;
  if (type === "sms") {
    const data = await fetchSMS();
    return res.json({ status: true, total: data.length, data });
  } else {
    return res.status(400).json({ error: "Invalid type. Use ?type=sms" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await login();
});
