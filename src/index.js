import express from "express";
import dotenv from "dotenv";
import { stkPush } from "./mpesa.js";

dotenv.config();
const app = express();

app.use(express.json());

// ---- 1. Trigger STK push ----
app.post("/api/stk", async (req, res) => {
    try {
        const { phone, amount } = req.body;

        const response = await stkPush({ phone, amount });
        res.json({ success: true, response });
    } catch (error) {
        console.error(error.response?.data || error);
        res.status(500).json({
            error: "STK push failed",
            details: error.response?.data || error.message,
        });
    }
});

// ---- 2. STK Callback ----
app.post("/api/stk-callback", (req, res) => {
    console.log("STK Callback received:", JSON.stringify(req.body, null, 2));

    // MUST respond with 200 quickly
    res.json({ message: "Callback received successfully" });
});

// ---- 3. Healthcheck ----
app.get("/", (req, res) => {
    res.send("M-Pesa STK backend running.");
});

const port = process.env.PORT || 5000;
app.listen(port, () =>
    console.log(`Server running on port ${port}`)
);
