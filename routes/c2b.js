import express from "express";

const router = express.Router();

router.post("/validate", (req, res) => {
  console.log("🟡 C2B Validation:", JSON.stringify(req.body, null, 2));

  // Accept payment
  res.json({
    ResultCode: 0,
    ResultDesc: "Accepted",
  });
});

// Confirmation URL (MOST IMPORTANT)
 
router.post("/confirm", async (req, res) => {
  console.log("🟢 C2B PAYMENT RECEIVED");
  console.log(JSON.stringify(req.body, null, 2));

  res.json({
    ResultCode: 0,
    ResultDesc: "Confirmation received successfully",
  });
});

export default router;
