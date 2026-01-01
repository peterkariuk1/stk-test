
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { stkPush } from "./middleware/mpesa.js";

import plotRoutes from "./routes/plots.js";
import c2bRoutes from "./routes/c2b.js";
import pullRoutes from "./routes/pull.js";
import { registerC2BUrls } from "./middleware/mpesa.js";




dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: ["http://localhost:8080", "https://jobawu.vercel.app"], // allow your frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // if you need cookies/auth
}));

app.use("/api/plots", plotRoutes);
app.use("/api/c2b", c2bRoutes);




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


app.use("/api/pull", pullRoutes);

// (async () => {
//   try {
//     const res = await registerC2BUrls();
//     console.log("✅ C2B URLs registered:", res);
//   } catch (e) {
//     console.error("❌ C2B URL registration failed:", e.response?.data || e);
//   }
// })();

// ---- 3. Healthcheck ----
app.get("/", (req, res) => {
    res.send("M-Pesa STK backend running.");
});

const port = process.env.PORT || 5000;
app.listen(port, () =>
    console.log(`Server running on port ${port}`)
);
