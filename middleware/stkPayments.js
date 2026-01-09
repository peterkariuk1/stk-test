import { db } from "../db/firebase.js";
import { formatTime, currentMonth } from "../utils/time.js";
import { hashMsisdn } from "../utils/shahash.js"; 

export const reconcileSTKPayment = async (stkDoc) => {
  const { checkoutRequestId, amount, rawPayload, status, resultCode, transTime } = stkDoc;

  // ✅ Only completed & successful transactions
  if (status !== "completed" || resultCode !== 0) return;

  // 🔁 Idempotency
  const existing = await db.collection("payments").doc(checkoutRequestId).get();
  if (existing.exists) return;

  // 📱 Extract & hash phone from callback
  const phoneItem = rawPayload?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
    (i) => i.Name === "PhoneNumber"
  );
  if (!phoneItem?.Value) return;
  const hashedMSISDN = hashMsisdn(String(phoneItem.Value));

  let matched = null;
  let expectedAmount = null;
  let resolvedPhone = hashedMSISDN;
  let resolvedName = "Unknown";
  let plotName = "Unknown";
  let units = null;
  let statusResolved = "pending";
  let overpayment = 0;
  let balance = 0;

  // 🔍 Fetch plots
  const plotsSnap = await db.collection("plots").get();

  plotsSnap.forEach((doc) => {
    const plot = doc.data();

    // ================= LUMPSUM =================
    if (plot.plotType === "lumpsum" && plot.MSISDN === hashedMSISDN) {
      matched = plot;
      expectedAmount = Number(plot.lumpsumExpected);
      resolvedPhone = plot.mpesaNumber ?? hashedMSISDN;
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
          resolvedPhone = t.phone ?? hashedMSISDN;
          resolvedName = t.name;
          plotName = plot.name;
          units = 1;
        }
      });
    }
  });

  // 🧮 Status & overpayment resolution
  if (matched && expectedAmount != null) {
    if (amount >= expectedAmount) {
      statusResolved = "completed";        // ✅ completed even if overpaid
      overpayment = amount - expectedAmount;
      balance = 0;
    } else {
      statusResolved = "incomplete";
      overpayment = 0;
      balance = expectedAmount - amount;
    }
  } else {
    // No matching plot → leave as pending, balance equals amount
    balance = amount;
    overpayment = 0;
  }

  // 🧾 Save to payments collection
  await db.collection("payments").doc(checkoutRequestId).set({
    id: checkoutRequestId,
    plotName,
    units,
    amount: {
      cash: null,
      mpesa: amount,
    },
    phone: resolvedPhone,
    name: resolvedName,
    time: formatTime(transTime),
    month: currentMonth(),
    source: "STK",
    status: statusResolved,
    balance,
    overpayment,
    createdAt: new Date(),
  });
};
