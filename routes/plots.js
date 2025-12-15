import express from "express";
import multer from "multer";
import { db } from "../db/firebase.js";
import { verifyFirebaseToken } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/registerplot",
  verifyFirebaseToken,
  upload.single("image"),
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
        feePerTenant,
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

      // 🧠 Plot-type–specific logic
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
          tenants: [],
          feePerTenant: null,
        };
      }

      // ===============================
      // 🔹 INDIVIDUAL
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

        plotPayload = {
          ...plotPayload,
          tenants: parsedTenants.map((t) => ({
            name: t.name,
            phone: t.phone,
          })),
          feePerTenant,
          units: parsedTenants.length, 
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

export default router;
