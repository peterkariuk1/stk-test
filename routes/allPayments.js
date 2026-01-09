import express from "express";
import { db } from "../db/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import { formatTime, currentMonth } from "../utils/time.js";

const router = express.Router();

// ---------------- GET ALL PAYMENTS ----------------
router.get("/", verifyFirebaseToken, async (req, res) => {
    try {
        const snapshot = await db.collection("payments").orderBy("createdAt", "desc").get();
        const payments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, payments });
    } catch (error) {
        console.error("GET PAYMENTS ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payments" });
    }
});

// ---------------- GET SINGLE PAYMENT ----------------
router.get("/:transId", verifyFirebaseToken, async (req, res) => {
    try {
        const paymentRef = db.collection("payments").doc(req.params.transId);
        const doc = await paymentRef.get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }
        return res.status(200).json({ success: true, payment: doc.data() });
    } catch (error) {
        console.error("GET PAYMENT ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payment" });
    }
});

// ---------------- CREATE PAYMENT ----------------
router.post("/", verifyFirebaseToken, async (req, res) => {
    try {
        const data = req.body;
        const { id: transId, plotName, units, amount, phone, name, time, month, source, status, balance } = data;

        // Validate required fields
        if (!transId || !amount?.mpesa || !phone || !name || !source) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Check if plot exists for plotName
        if (plotName) {
            const plotSnap = await db.collection("plots").where("name", "==", plotName).limit(1).get();
            if (plotSnap.empty) {
                return res.status(400).json({ success: false, message: `Plot ${plotName} does not exist` });
            }
        }

        const paymentRef = db.collection("payments").doc(transId);
        const existing = await paymentRef.get();
        if (existing.exists) {
            return res.status(409).json({ success: false, message: "Payment with this transId already exists" });
        }

        await paymentRef.set({
            id: transId,
            plotName: plotName || null,
            units: units || null,
            amount: {
                cash: amount?.cash || null,
                mpesa: amount.mpesa,
            },
            phone,
            name,
            time: time || formatTime(new Date()),
            month: month || currentMonth(),
            source,
            status: status || "pending",
            balance: balance ?? amount.mpesa,
            createdAt: new Date(),
        });

        return res.status(201).json({ success: true, message: "Payment created successfully" });
    } catch (error) {
        console.error("CREATE PAYMENT ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to create payment" });
    }
});

// ---------------- EDIT PAYMENT ----------------
router.put("/:transId", verifyFirebaseToken, async (req, res) => {
    try {
        const paymentRef = db.collection("payments").doc(req.params.transId);
        const doc = await paymentRef.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }

        const existingPayment = doc.data();

        const { amount: newAmount, phone, name, plotName } = req.body;

        const updatePayload: any = {};

        // 🔹 Only editable fields
        if (phone) updatePayload.phone = phone;
        if (name) updatePayload.name = name;

        // 🔹 Cash addition
        if (newAmount?.cash != null) {
            const totalPaid = (existingPayment.amount.mpesa || 0) + newAmount.cash;
            const totalExpected = existingPayment.units && existingPayment.plotName
                ? (() => {
                    // fetch plot info to calculate total expected
                    return db.collection("plots").where("name", "==", existingPayment.plotName).get()
                        .then(snap => {
                            if (snap.empty) return null;
                            const plot = snap.docs[0].data();
                            if (plot.plotType === "lumpsum") return Number(plot.lumpsumExpected);
                            if (plot.plotType === "individual") return Number(plot.feePerTenant) * plot.tenants.length;
                            return null;
                        });
                })()
                : null;

            const expected = await totalExpected;

            if (expected != null && totalPaid > expected) {
                return res.status(400).json({ success: false, message: "Cash + MPESA cannot exceed expected total" });
            }

            updatePayload["amount.cash"] = newAmount.cash;
            updatePayload.balance = expected != null ? expected - totalPaid : existingPayment.balance - newAmount.cash;
        }

        // 🔹 PlotName edits are not allowed
        if (plotName && plotName !== existingPayment.plotName) {
            return res.status(400).json({ success: false, message: "Plot name cannot be edited" });
        }

        await paymentRef.update(updatePayload);

        return res.status(200).json({ success: true, message: "Payment updated successfully" });
    } catch (error) {
        console.error("EDIT PAYMENT ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to update payment" });
    }
});

// ---------------- DELETE PAYMENT ----------------
router.delete("/:transId", verifyFirebaseToken, async (req, res) => {
    try {
        const paymentRef = db.collection("payments").doc(req.params.transId);
        const doc = await paymentRef.get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }

        await paymentRef.delete();
        return res.status(200).json({ success: true, message: "Payment deleted successfully" });
    } catch (error) {
        console.error("DELETE PAYMENT ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to delete payment" });
    }
});

export default router;
