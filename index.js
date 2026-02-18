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

// ================= LOGIN =================
async function login() {
  try {
    const res = await axios.get(BASE + "/login");

    cookies = res.headers["set-cookie"].join(";");

    const match = res.data.match(/What is (\d+) \+ (\d+)/);
    let ans = "10";

    if (match) ans = Number(match[1]) + Number(match[2]);

    await axios.post(
      BASE + "/signin",
      qs.stringify({
        username: PANEL.username,
        password: PANEL.password,
        capt: ans
      }),
      {
        headers: {
          Cookie: cookies,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const stats = await axios.get(BASE + "/client/SMSCDRStats", {
      headers: { Cookie: cookies }
    });

    const key = stats.data.match(/sesskey=([^&"]+)/);
    if (key) sesskey = key[1];

    console.log("✅ Login OK");
  } catch (e) {
    console.log("Login Error:", e.message);
  }
}

// ================= FETCH SMS =================
async function fetchSMS() {
  try {
    if (!sesskey) await login();

    const today = new Date().toISOString().split("T")[0];

    const url =
      `${BASE}/client/res/data_smscdr.php?` +
      `fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59` +
      `&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;

    const res = await axios.get(url, {
      headers: {
        Cookie: cookies,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      time: r[0],
      number: r[2],
      service: r[3],
      message: r[4]
    }));
  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= API =================
app.get("/api/sms", async (req, res) => {
  const data = await fetchSMS();
  res.json({ status: true, total: data.length, data });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 Running on port", PORT);
  await login();
});
