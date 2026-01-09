import express from "express";
import { db } from "../db/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";

const router = express.Router();

/* ===========================
   GET ALL PAYMENTS
=========================== */
router.get("/", verifyFirebaseToken, async (req, res) => {
    try {
        const snapshot = await db
            .collection("payments")
            .orderBy("createdAt", "desc")
            .get();

        const payments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json({ success: true, payments });
    } catch (err) {
        console.error("GET PAYMENTS ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to fetch payments" });
    }
});

/* ===========================
   GET SINGLE PAYMENT
=========================== */
router.get("/:transID", verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection("payments").doc(req.params.transID).get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }

        res.status(200).json({ success: true, payment: doc.data() });
    } catch (err) {
        console.error("GET PAYMENT ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to fetch payment" });
    }
});

/* ===========================
   CREATE MANUAL PAYMENT
   (cash / mpesa reconciliation)
=========================== */
router.post("/", verifyFirebaseToken, async (req, res) => {
    try {
        const {
            transID,
            amount,
            phone,
            name,
            source
        } = req.body;

        if (!transID || !amount?.total || !phone || !name || !source) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        // ❗ Do NOT allow direct writes if ID exists
        const existing = await db.collection("payments").doc(transID).get();
        if (existing.exists) {
            return res.status(409).json({
                success: false,
                message: "Payment with this transID already exists"
            });
        }

        /**
         * Manual payments MUST go through the same
         * reconciliation engine as STK / C2B
         * 
         * This route should enqueue or call the
         * same reconciliation logic internally.
         */
        return res.status(400).json({
            success: false,
            message: "Manual payment creation must use reconciliation engine"
        });

    } catch (err) {
        console.error("CREATE PAYMENT ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to create payment" });
    }
});

/* ===========================
   EDIT PAYMENT (SAFE FIELDS)
=========================== */
router.put("/:transID", verifyFirebaseToken, async (req, res) => {
    try {
        const ref = db.collection("payments").doc(req.params.transID);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }

        const { phone, name } = req.body;

        const updatePayload = {};

        // ✅ Only identity corrections allowed
        if (phone) updatePayload.phone = phone;
        if (name) updatePayload.name = name;

        // ❌ Explicitly block dangerous edits
        const forbiddenFields = [
            "amount",
            "monthPaid",
            "less",
            "status",
            "plotName",
            "units",
            "source"
        ];

        forbiddenFields.forEach(field => {
            if (req.body[field] !== undefined) {
                throw new Error(`Editing '${field}' is not allowed`);
            }
        });

        await ref.update(updatePayload);

        res.status(200).json({
            success: true,
            message: "Payment updated successfully"
        });

    } catch (err) {
        console.error("EDIT PAYMENT ERROR:", err.message);
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
});

/* ===========================
   DELETE PAYMENT
=========================== */
router.delete("/:transID", verifyFirebaseToken, async (req, res) => {
    try {
        const ref = db.collection("payments").doc(req.params.transID);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }

        await ref.delete();

        res.status(200).json({
            success: true,
            message: "Payment deleted successfully"
        });
    } catch (err) {
        console.error("DELETE PAYMENT ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete payment"
        });
    }
});

export default router;
