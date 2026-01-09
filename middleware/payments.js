import { db } from "../db/firebase.js";
import { formatTime, currentMonth } from "../utils/time.js";

export const reconcileC2BPayment = async (c2bDoc) => {
  const { amount, phone: hashedMSISDN, transId, rawPayload } = c2bDoc;

  // 🔁 Idempotency
  const existingPayment = await db.collection("payments").doc(transId).get();
  if (existingPayment.exists) return;

  let matched = null;
  let expectedAmount = null;
  let resolvedPhone = hashedMSISDN;
  let resolvedName = "Unknown";
  let plotName = "Unknown";
  let units = null;
  let status = "pending";

  const plotsSnap = await db.collection("plots").get();

  plotsSnap.forEach((doc) => {
    const plot = doc.data();

    // ================= LUMPSUM =================
    if (plot.plotType === "lumpsum" && plot.MSISDN === hashedMSISDN) {
      matched = plot;
      expectedAmount = Number(plot.lumpsumExpected);
      resolvedPhone = plot.mpesaNumber;
      resolvedName = plot.name;
      plotName = plot.name;
      units = Number(plot.units || 1);
    }

    // ================= INDIVIDUAL =================
    if (plot.plotType === "individual") {
      plot.tenants?.forEach((t) => {
        if (t.MSISDN === hashedMSISDN) {
          matched = plot;
          expectedAmount = Number(plot.feePerTenant);
          resolvedPhone = t.phone;
          resolvedName = t.name;
          plotName = plot.name;
          units = 1;
        }
      });
    }
  });

  // 🧮 Status resolution and overpayment
  let overpayment = 0;
  if (matched) {
    if (amount >= expectedAmount) {
      status = "completed"; // ✅ mark as completed even if overpaid
      overpayment = amount - expectedAmount;
    } else {
      status = "incomplete"; // underpaid
    }
  }

  const balance = matched ? expectedAmount - amount : amount;

  // 🧾 Save payment
  await db.collection("payments").doc(transId).set({
    id: transId,
    plotName,
    units,
    amount: {
      cash: null,
      mpesa: amount,
    },
    phone: resolvedPhone,
    name: resolvedName,
    time: formatTime(rawPayload.TransTime),
    month: currentMonth(),
    source: "C2B",
    status,
    balance,
    overpayment, // ✅ new field
    createdAt: new Date(),
  });
};
