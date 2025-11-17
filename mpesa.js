import axios from "axios";

export const generateToken = async () => {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const { data } = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return data.access_token;
};

export const stkPush = async ({ phone, amount }) => {
  const token = await generateToken();

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .substring(0, 14);

  const password = Buffer.from(
    process.env.DARAJA_SHORTCODE + process.env.DARAJA_PASSKEY + timestamp
  ).toString("base64");

  const payload = {
    BusinessShortCode: process.env.DARAJA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.DARAJA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: process.env.CALLBACK_URL,
    AccountReference: "Test123",
    TransactionDesc: "Testing STK push"
  };

  const { data } = await axios.post(
    "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return data;
};
