import { db } from "../db/firebase.js";
import { formatTime, currentMonth } from "../utils/time.js";
import { hashMsisdn } from "../utils/shahash.js"; 

export const reconcileSTKPayment = async (stkDoc) => {
    const {
        checkoutRequestId,
        amount,
        rawPayload,
        status,
        resultCode,
        transTime,
    } = stkDoc;

    if (status !== "completed" || resultCode !== 0) return;

    // 🔁 Idempotency
    const existing = await db
        .collection("payments")
        .doc(checkoutRequestId)
        .get();

    if (existing.exists) return;

    // 📱 Extract & hash phone from callback
    const phoneItem =
        rawPayload?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
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

    if (matched) {
        statusResolved =
            amount === expectedAmount ? "completed" : "incomplete";
    }

    const balance = matched
        ? amount - expectedAmount
        : amount;

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
        createdAt: new Date(),
    });
};
