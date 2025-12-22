import express from "express";
import { db } from "../db/firebase.js";

const router = express.Router();

// ---- C2B Confirmation ----
// router.post("/confirmation", async (req, res) => {
//     try {
//         const payload = req.body;

//         console.log("✅ C2B CONFIRMATION:", JSON.stringify(payload, null, 2));

//         const {
//             TransID,
//             TransAmount,
//             BusinessShortCode,
//             BillRefNumber,
//             MSISDN,
//             TransTime,
//             TransactionType,
//             FirstName,
//             MiddleName,
//             LastName,
//             OrgAccountBalance,
//         } = payload;

//         // Always ACK Safaricom
//         if (!TransID) {
//             return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
//         }

//         const txRef = db.collection("c2b_transactions").doc(TransID);
//         const existing = await txRef.get();

//         // 🔁 Idempotency
//         if (existing.exists) {
//             console.log("⚠️ Duplicate callback:", TransID);
//             return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
//         }

//         await txRef.set({
//             transId: TransID,
//             amount: Number(TransAmount),
//             shortCode: BusinessShortCode,
//             billRefNumber: BillRefNumber || null,
//             phone: MSISDN,
//             transactionType: TransactionType,
//             customerName: [FirstName, MiddleName, LastName].filter(Boolean).join(" "),
//             transTime: TransTime,
//             orgAccountBalance: OrgAccountBalance || null,

//             source: "C2B",
//             status: "completed",
//             rawPayload: payload,
//             createdAt: new Date(),
//         });

//         console.log("✅ Saved C2B tx:", TransID);

//         return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
//     } catch (error) {
//         console.error("❌ C2B ERROR:", error);
//         return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
//     }
// });

router.post("/confirmation", async (req, res) => {
    console.log("🔥🔥🔥 C2B CONFIRMATION ENDPOINT HIT 🔥🔥🔥");
    console.log(JSON.stringify(req.body, null, 2));

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ---- OPTIONAL: Validation ----
router.post("/validation", async (req, res) => {
    console.log("🔎 C2B VALIDATION:", JSON.stringify(req.body, null, 2));

    return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

export default router;
