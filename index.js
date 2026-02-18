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

// ================= FETCH NUMBERS =================
async function fetchNumbers() {
  try {
    if (!sesskey) await login();

    const url =
      `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&_=${Date.now()}`;

    const res = await axios.get(url, {
      headers: {
        Cookie: cookies,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    // Agar response me aaData nahi hai, return empty structure
    if (!res.data.aaData) return {
      sEcho: 2,
      iTotalRecords: "0",
      iTotalDisplayRecords: "0",
      aaData: []
    };

    const data = res.data.aaData.map(r => [
      r[0], // id / name
      r[1], // empty or number
      r[2], // number / country
      r[3], // service
      r[4], // status
      r[5]  // extra
    ]);

    return {
      sEcho: 2,
      iTotalRecords: String(data.length),
      iTotalDisplayRecords: String(data.length),
      aaData: data
    };

  } catch (e) {
    sesskey = "";
    return {
      sEcho: 2,
      iTotalRecords: "0",
      iTotalDisplayRecords: "0",
      aaData: []
    };
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
app.get("/api", async (req, res) => {
  const { type } = req.query;

  if (!type) return res.status(400).json({ error: "Use ?type=numbers or ?type=sms" });

  if (type === "numbers") {
    const data = await fetchNumbers();
    return res.json(data);
  } else if (type === "sms") {
    const data = await fetchSMS();
    return res.json({ status: true, total: data.length, data });
  } else {
    return res.status(400).json({ error: "Invalid type. Use numbers or sms" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 Running on port", PORT);
  await login();
});
