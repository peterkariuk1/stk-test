import { db } from "../db/firebase.js";
import { formatTime, currentMonth } from "../utils/time.js";

export const reconcileC2BPayment = async (c2bDoc) => {
  const {
    amount,
    phone: hashedMSISDN,
    transId,
    rawPayload,
  } = c2bDoc;

  // 🔁 Idempotency
  const existingPayment = await db
    .collection("payments")
    .doc(transId)
    .get();

  if (existingPayment.exists) return;

  let matched = null;
  let expectedAmount = null;
  let resolvedPhone = hashedMSISDN;
  let resolvedName = "Unknown";
  let status = "pending";

  // 🔍 Fetch plots
  const plotsSnap = await db.collection("plots").get();

  plotsSnap.forEach((doc) => {
    const plot = doc.data();

    // ================= LUMPSUM =================
    if (
      plot.plotType === "lumpsum" &&
      plot.MSISDN === hashedMSISDN
    ) {
      matched = plot;
      expectedAmount = Number(plot.lumpsumExpected);
      resolvedPhone = plot.mpesaNumber;
      resolvedName = plot.name;
    }

    // ================= INDIVIDUAL =================
    if (plot.plotType === "individual") {
      plot.tenants?.forEach((t) => {
        if (t.MSISDN === hashedMSISDN) {
          matched = plot;
          expectedAmount = Number(plot.feePerTenant);
          resolvedPhone = t.phone;
          resolvedName = t.name;
        }
      });
    }
  });

  // 🧮 Status resolution
  if (matched) {
    status =
      amount === expectedAmount ? "completed" : "incomplete";
  }

  const balance = matched
    ? amount - expectedAmount
    : amount;

  // 🧾 Create payment
  await db.collection("payments").doc(transId).set({
    id: transId,
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
    createdAt: new Date(),
  });
};
