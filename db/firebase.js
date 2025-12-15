import dotenv from "dotenv";
dotenv.config();

import admin from "firebase-admin";

if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is undefined");
}

const serviceAccount = JSON.parse(
  Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
    "base64"
  ).toString("utf-8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export { admin, db };

