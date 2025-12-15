
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { stkPush, registerC2BUrls, c2bValidation, c2bConfirmation, pullC2BTransactions, pullCallback } from "./middleware/mpesa.js";

import plotRoutes from "./routes/plots.js";


dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: "http://localhost:8080", // allow your frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // if you need cookies/auth
}));

app.use("/api/plots", plotRoutes);



// ---- 1. Trigger STK push ----
app.post("/api/stk", async (req, res) => {
    const { phone, amount } = req.body;

    try {
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


// ---- 6. Register C2B Payment URLs ----
app.get("/api/register-c2b", async (req, res) => {
    try {
        const response = await registerC2BUrls();
        res.json({ success: true, response });
    } catch (error) {
        console.error("C2B Registration Error:", error.response?.data || error);
        res.status(500).json({
            error: "C2B registration failed",
            details: error.response?.data || error.message,
        });
    }
});

// C2B VALIDATION (ALLOW ALL)
app.post("/api/c2b/validate", c2bValidation);

// C2B CONFIRMATION (LISTENER)
app.post("/api/c2b/confirm", c2bConfirmation);

app.post("/api/c2b/pull", async (req, res) => {
    try {
        const { fromDate, toDate } = req.body;

        const data = await pullC2BTransactions({
            shortcode: 510615,
            fromDate,
            toDate,
        });

        res.json({ success: true, data });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message,
        });
    }
});

// index.js
app.post("/api/pull/callback", pullCallback);


// ---- 3. Healthcheck ----
app.get("/", (req, res) => {
    res.send("M-Pesa STK backend running.");
});

const port = process.env.PORT || 5000;
app.listen(port, () =>
    console.log(`Server running on port ${port}`)
);
