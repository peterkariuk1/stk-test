import express from "express";
import { db } from "../db/firebase.js";
import { reconcileC2BPayment } from "../middleware/payments.js";

const router = express.Router();


router.post("/confirm", async (req, res) => {
    try {
        const payload = req.body;
        const { TransID, TransAmount, MSISDN } = payload;

        if (!TransID) {
            return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const txRef = db.collection("c2b_transactions").doc(TransID);
        const existing = await txRef.get();

        if (existing.exists) {
            return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const c2bData = {
            transId: TransID,
            amount: Number(TransAmount),
            phone: MSISDN,
            rawPayload: payload,
            source: "C2B",
            status: "completed",
            createdAt: new Date(),
        };

        await txRef.set(c2bData);

        await reconcileC2BPayment(c2bData);

        return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
        console.error("C2B ERROR:", error);
        return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
});


// ---- OPTIONAL: Validation ----
router.post("/validate", async (req, res) => {
    console.log("🔎 C2B VALIDATION:", JSON.stringify(req.body, null, 2));

    return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

export default router;
