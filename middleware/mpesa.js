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


/* --------------------------------------
   REGISTER C2B URLS (also with logs)
-------------------------------------- */
export const registerC2BUrls = async () => {
  const token = await generateToken();

  console.log("🟢 GENERATED TOKEN:", token);

  if (!token) {
    throw new Error("No access token generated");
  }

  const payload = {
    ShortCode: 510615,
    ResponseType: "Completed",
    ConfirmationURL: process.env.C2B_CONFIRMATION_URL,
    ValidationURL: process.env.C2B_VALIDATION_URL,
  };

  const { data } = await axios.post(
    "https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl",
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
};



/* --------------------------------------
   C2B VALIDATION (ALLOW ALL)
-------------------------------------- */
export const c2bValidation = async (req, res) => {
  console.log("🟡 C2B VALIDATION HIT");
  console.log(JSON.stringify(req.body, null, 2));

  // ✅ ACCEPT ALL PAYMENTS
  res.json({
    ResultCode: 0,
    ResultDesc: "Accepted",
  });
};

/* --------------------------------------
   C2B CONFIRMATION (MAIN LISTENER)
-------------------------------------- */
export const c2bConfirmation = async (req, res) => {
  console.log("🟢 C2B PAYMENT CONFIRMED");
  console.log(JSON.stringify(req.body, null, 2));

  res.json({
    ResultCode: 0,
    ResultDesc: "Confirmation received successfully",
  });
};
