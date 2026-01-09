import express from "express";
import multer from "multer";
import { db } from "../db/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import { hashMsisdn } from "../utils/shahash.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/registerplot",
  verifyFirebaseToken,
  async (req, res) => {
    try {
      const {
        name,
        location,
        caretakerName,
        caretakerPhone,
        plotType,
        units,
        lumpsumExpected,
        mpesaNumber,
        tenants,
      } = req.body;

      // 🔒 Base validation
      if (!name || !location || !plotType) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // 🔍 Prevent duplicate plot names
      const existing = await db
        .collection("plots")
        .where("name", "==", name)
        .limit(1)
        .get();

      if (!existing.empty) {
        return res.status(409).json({
          success: false,
          message: "A plot with this name already exists",
        });
      }

      let plotPayload = {
        name,
        location,
        caretakerName: caretakerName || null,
        caretakerPhone: caretakerPhone || null,
        plotType,
        createdBy: req.user.uid,
        createdAt: new Date(),
      };

      // ===============================
      // 🔹 LUMPSUM
      // ===============================
      if (plotType === "lumpsum") {
        if (!units || !lumpsumExpected || !mpesaNumber) {
          return res.status(400).json({
            success: false,
            message:
              "Units, lumpsum amount and MPESA number are required for lumpsum plots",
          });
        }

        plotPayload = {
          ...plotPayload,
          units: Number(units),
          lumpsumExpected: Number(lumpsumExpected),
          mpesaNumber,
          MSISDN: hashMsisdn(mpesaNumber),
          tenants: [],
        };
      }

      // ===============================
      // 🔹 INDIVIDUAL (UPDATED)
      // ===============================
      if (plotType === "individual") {
        const parsedTenants =
          typeof tenants === "string" ? JSON.parse(tenants) : tenants;

        if (!parsedTenants || parsedTenants.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one tenant is required",
          });
        }

        const allowedAmounts = ["100", "150", "200", "250"];

        for (const t of parsedTenants) {
          if (!t.name || !t.phone || !t.amount) {
            return res.status(400).json({
              success: false,
              message: "Each tenant must have name, phone and amount",
            });
          }

          if (!allowedAmounts.includes(String(t.amount))) {
            return res.status(400).json({
              success: false,
              message: `Invalid tenant amount: ${t.amount}`,
            });
          }
        }

        plotPayload = {
          ...plotPayload,
          units: parsedTenants.length,
          tenants: parsedTenants.map((t) => ({
            name: t.name,
            phone: t.phone,
            MSISDN: hashMsisdn(t.phone),
            amount: Number(t.amount), // ✅ STORED PER TENANT
          })),
          lumpsumExpected: null,
          mpesaNumber: null,
        };
      }

      await db.collection("plots").add(plotPayload);

      return res.status(201).json({
        success: true,
        message: "Plot registered successfully",
      });
    } catch (error) {
      console.error("REGISTER PLOT ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to register plot",
      });
    }
  }
);


// GET /getplots
router.get("/getplots", verifyFirebaseToken, async (req, res) => {
  try {
    const snapshot = await db.collection("plots").orderBy("createdAt", "desc").get();
    const plots = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      totalPaid: undefined,
      totalUnpaid: undefined,
    }));
    res.status(200).json({ success: true, plots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch plots" });
  }
});

router.delete("/:plotId", verifyFirebaseToken, async (req, res) => {
  try {
    const plotRef = db.collection("plots").doc(req.params.plotId);
    const doc = await plotRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Plot not found" });
    }
    await plotRef.delete();
    return res.status(200).json({ success: true, message: "Plot deleted successfully" });
  } catch (err) {
    console.error("DELETE PLOT ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete plot" });
  }
});


router.get("/:plotId", verifyFirebaseToken, async (req, res) => {
  try {
    const plotRef = db.collection("plots").doc(req.params.plotId);
    const doc = await plotRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: "Plot not found",
      });
    }

    return res.status(200).json({
      success: true,
      plot: {
        id: doc.id,
        ...doc.data(),
      },
    });
  } catch (err) {
    console.error("GET PLOT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch plot",
    });
  }
});

router.put(
  "/:plotId",
  verifyFirebaseToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const plotRef = db.collection("plots").doc(req.params.plotId);
      const existingDoc = await plotRef.get();

      if (!existingDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Plot not found",
        });
      }

      const {
        name,
        location,
        caretakerName,
        caretakerPhone,
        units,
        lumpsumExpected,
        mpesaNumber,
        feePerTenant,
        tenants,
      } = req.body;

      const existingPlot = existingDoc.data();

      let updatePayload = {
        name,
        location,
        caretakerName,
        caretakerPhone,
        updatedAt: new Date(),
      };

      // ===============================
      // 🔹 LUMPSUM
      // ===============================
      if (existingPlot.plotType === "lumpsum") {
        if (!units || !lumpsumExpected) {
          return res.status(400).json({
            success: false,
            message: "Units and lumpsum expected are required",
          });
        }

        updatePayload = {
          ...updatePayload,
          units: Number(units),
          lumpsumExpected: Number(lumpsumExpected),
          mpesaNumber,
          MSISDN: mpesaNumber ? hashMsisdn(mpesaNumber) : null,
        };
      }

      // ===============================
      // 🔹 INDIVIDUAL
      // ===============================
      if (existingPlot.plotType === "individual") {
        const parsedTenants =
          typeof tenants === "string" ? JSON.parse(tenants) : tenants;

        if (!parsedTenants || parsedTenants.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one tenant is required",
          });
        }

        updatePayload = {
          ...updatePayload,
          tenants: parsedTenants.map((t) => ({
            ...t,
            MSISDN: hashMsisdn(t.phone), // ✅ ADDED
          })),
          feePerTenant,
          units: parsedTenants.length,
        };
      }

      await plotRef.update(updatePayload);

      return res.status(200).json({
        success: true,
        message: "Plot updated successfully",
      });
    } catch (error) {
      console.error("UPDATE PLOT ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update plot",
      });
    }
  }
);



export default router;
