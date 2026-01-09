import { db } from "../db/firebase.js";
import { formatTime, currentMonth } from "../utils/time.js";
import { hashMsisdn } from "../utils/shahash.js";

export const reconcileSTKPayment = async (stkDoc) => {
    const { checkoutRequestId, amount: mpesaAmount, cashAmount = 0, rawPayload, status, resultCode, transTime } = stkDoc;

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

    const totalAmount = (Number(mpesaAmount) || 0) + (Number(cashAmount) || 0);

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
        if (totalAmount >= expectedAmount) {
            statusResolved = "completed";       // ✅ mark completed even if overpaid
            overpayment = totalAmount - expectedAmount;
            balance = 0;
        } else {
            statusResolved = "incomplete";      // underpaid
            overpayment = 0;
            balance = expectedAmount - totalAmount;
        }
    } else {
        // No matching plot → pending, balance = totalAmount
        balance = totalAmount;
        overpayment = 0;
    }

    // 🧾 Save to payments collection
    await db.collection("payments").doc(checkoutRequestId).set({
        id: checkoutRequestId,
        plotName,
        units,
        amount: {
            cash: cashAmount || null,
            mpesa: mpesaAmount || null,
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
