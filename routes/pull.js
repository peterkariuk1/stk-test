import express from "express";
import {
  registerPullShortcode,
  queryPullTransactions} from "../middleware/mpesaPull.js"

const router = express.Router();

/**
 * Register Pull ShortCode (ONE TIME)
 */
router.post("/register", async (req, res) => {
  try {
    const response = await registerPullShortcode();
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

/**
 * Query Pull Transactions
 */
router.get("/query", async (req, res) => {
  const { startDate, endDate, offset } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: "startDate and endDate are required",
    });
  }

  try {
    const response = await queryPullTransactions({
      startDate,
      endDate,
      offset,
    });

    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

export default router;
