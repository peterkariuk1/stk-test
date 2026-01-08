import express from "express";
import { db } from "../db/firebase.js";

const router = express.Router();

router.post("/confirm", async (req, res) => {
    try {
        const payload = req.body;

        console.log("C2B CONFIRMATION:", JSON.stringify(payload, null, 2));

        const {
            TransID,
        } = payload;

        if (!TransID) {
            return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const txRef = db.collection("c2b_transactions").doc(TransID);
        const existing = await txRef.get();

        if (existing.exists) {
            console.log(" Duplicate callback:", TransID);
            return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        await txRef.set({
            source: "C2B",
            status: "completed",
            rawPayload: payload,
        });

        console.log(" Saved C2B tx:", TransID);

        return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error) {
        console.error(" C2B ERROR:", error);
        return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
});

// router.post("/confirm", async (req, res) => {
//     console.log("C2B CONFIRMATION ENDPOINT HIT");
//     console.log(JSON.stringify(req.body, null, 2));

//     res.json({ ResultCode: 0, ResultDesc: "Accepted" });
// });

// ---- OPTIONAL: Validation ----
router.post("/validate", async (req, res) => {
    console.log("🔎 C2B VALIDATION:", JSON.stringify(req.body, null, 2));

    return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

export default router;
