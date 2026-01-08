import express from "express";
import crypto from "crypto";
import { db } from "../db/firebase.js";

const router = express.Router();

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

router.post("/", async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    // 🔁 Idempotency key
    const docId = CheckoutRequestID || MerchantRequestID;

    const existing = await db
      .collection("stk_transactions")
      .doc(docId)
      .get();

    if (existing.exists) {
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Defaults
    let amount = null;
    let phone = null;
    let receipt = null;
    let transTime = null;

    if (CallbackMetadata?.Item) {
      CallbackMetadata.Item.forEach((i) => {
        if (i.Name === "Amount") amount = Number(i.Value);
        if (i.Name === "PhoneNumber") phone = sha256(i.Value);
        if (i.Name === "MpesaReceiptNumber") receipt = i.Value;
        if (i.Name === "TransactionDate") transTime = String(i.Value);
      });
    }

    await db.collection("stk_transactions").doc(docId).set({
      checkoutRequestId: CheckoutRequestID,
      merchantRequestId: MerchantRequestID,
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      amount,
      phone, // 🔐 hashed MSISDN
      receipt,
      transTime,
      source: "STK",
      status: ResultCode === 0 ? "completed" : "failed",
      rawPayload: req.body,
      createdAt: new Date(),
    });

    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("STK CALLBACK ERROR:", err);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

export default router;
