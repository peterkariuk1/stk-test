import axios from "axios";

const BASE_URL = "https://api.safaricom.co.ke";

export const generateToken = async () => {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const { data } = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    return data.access_token;

  } catch (error) {
    console.log("❌ TOKEN ERROR:", error.response?.data || error.message);
    throw error;
  }
};

export const stkPush = async ({ phone, amount }) => {
  console.log("\n========================================");
  console.log("📲 Starting STK Push...");
  console.log("📞 Phone:", phone);
  console.log("💵 Amount:", amount);

  const token = await generateToken();
  // TIMESTAMP
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .substring(0, 14);

  // PASSWORD
  const password = Buffer.from(
    process.env.DARAJA_SHORTCODE + process.env.DARAJA_PASSKEY + timestamp
  ).toString("base64");


  // PAYLOAD
  const payload = {
    BusinessShortCode: 3581417,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerBuyGoodsOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: 510615,
    PhoneNumber: phone,
    CallBackURL: process.env.CALLBACK_URL,
    AccountReference: "Jowabu",
    TransactionDesc: "Garbage Payment",
  };

  console.log("========================================\n");

  try {
    const { data } = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("✅ SAFARICOM RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

    return data;

  } catch (error) {
    console.log("❌ SAFARICOM ERROR RESPONSE:");
    console.log(error.response?.data || error.message);
    throw error;
  }
};


export const registerC2BUrls = async () => {
  const token = await generateToken();

  const payload = {
    ShortCode: process.env.C2B_SHORTCODE,
    ResponseType: "Completed",
    ConfirmationURL: process.env.C2B_CONFIRMATION_URL,
    ValidationURL: process.env.C2B_VALIDATION_URL,
  };

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/c2b/v2/registerurl`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return data;
};


import { registerC2BUrls } from "./middleware/mpesa.js";

(async () => {
  try {
    const res = await registerC2BUrls();
    console.log("✅ C2B URLs registered:", res);
  } catch (e) {
    console.error("❌ C2B URL registration failed:", e.response?.data || e);
  }
})();

