import { db } from "../db/firebase.js";
import { formatTime } from "../utils/time.js";
import { hashMsisdn } from "../utils/shahash.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const nextMonth = (monthStr) => {
    const [m, y] = monthStr.split("-");
    let idx = MONTHS.indexOf(m) + 1;
    let year = Number(y);

    if (idx === 12) {
        idx = 0;
        year++;
    }

    return `${MONTHS[idx]}-${year}`;
};

export const reconcileSTKPayment = async (stkDoc) => {
    const {
        checkoutRequestId,
        amount: mpesaAmount,
        cashAmount = 0,
        rawPayload,
        status,
        resultCode,
        transTime
    } = stkDoc;

    /* ---------------- ACCEPT ONLY SUCCESS ---------------- */
    if (status !== "completed" || resultCode !== 0) return;

    /* ---------------- IDEMPOTENCY ---------------- */
    const paymentRef = db.collection("payments").doc(checkoutRequestId);
    const exists = await paymentRef.get();
    if (exists.exists) return;

    /* ---------------- EXTRACT + HASH MSISDN ---------------- */
    const phoneItem =
        rawPayload?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
            (i) => i.Name === "PhoneNumber"
        );

    if (!phoneItem?.Value) return;

    const hashedMSISDN = hashMsisdn(String(phoneItem.Value));

    const totalAmount =
        (Number(mpesaAmount) || 0) + (Number(cashAmount) || 0);

    let plotName = "Unknown";
    let units = null;
    let resolvedName = "Unknown";
    let resolvedPhone = hashedMSISDN;
    let expectedAmount = null;
    let isRecognized = false;

    /* ---------------- RESOLVE PLOT ---------------- */
    const plotsSnap = await db.collection("plots").get();

    plotsSnap.forEach((doc) => {
        const plot = doc.data();

        // LUMPSUM
        if (plot.plotType === "lumpsum" && plot.MSISDN === hashedMSISDN) {
            isRecognized = true;
            expectedAmount = Number(plot.lumpsumExpected);
            plotName = plot.name;
            units = Number(plot.units || 1);
            resolvedName = plot.name;
            resolvedPhone = plot.mpesaNumber ?? hashedMSISDN;
        }

        // INDIVIDUAL
        if (plot.plotType === "individual") {
            plot.tenants?.forEach((t) => {
                if (t.MSISDN === hashedMSISDN) {
                    isRecognized = true;
                    expectedAmount = Number(t.amount);
                    plotName = plot.name;
                    units = Number(plot.units);
                    resolvedName = t.name;
                    resolvedPhone = t.phone ?? hashedMSISDN;
                }
            });
        }
    });

    const paymentMonth = formatTime(transTime, "MMM-YYYY");

    /* ---------------- UNRECOGNIZED ---------------- */
    if (!isRecognized || expectedAmount == null) {
        await paymentRef.set({
            transID: checkoutRequestId,
            plotName: "Unknown",
            units: null,
            amount: {
                mpesa: mpesaAmount || null,
                cash: cashAmount || null,
                total: totalAmount
            },
            phone: resolvedPhone,
            name: "Unknown",
            time: formatTime(transTime),
            source: "STK",
            monthPaid: [],
            less: null,
            status: [{ state: "unrecognized" }],
            createdAt: new Date()
        });
        return;
    }

    /* ---------------- PREVIOUS LESS (SAFE) ---------------- */
    let carriedLess = null;

    try {
        const prevSnap = await db.collection("payments")
            .where("phone", "==", resolvedPhone)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!prevSnap.empty) {
            const prev = prevSnap.docs[0].data();
            if (prev.less?.amount > 0) {
                carriedLess = prev.less;
            }
        }
    } catch (err) {
        console.warn("LESS lookup skipped (index missing)");
    }

    /* ---------------- ALLOCATION ---------------- */
    let remaining = totalAmount;
    let monthPaid = [];
    let statusArr = [];
    let less = null;

    // 1️⃣ Clear carried LESS
    if (carriedLess) {
        const due = carriedLess.amount;

        if (remaining >= due) {
            monthPaid.push({ month: carriedLess.dueMonth, amount: due });
            statusArr.push({ month: carriedLess.dueMonth, state: "complete" });
            remaining -= due;
        } else {
            monthPaid.push({ month: carriedLess.dueMonth, amount: remaining });
            less = { amount: due - remaining, dueMonth: carriedLess.dueMonth };
            statusArr.push({ month: carriedLess.dueMonth, state: "incomplete" });
            remaining = 0;
        }
    }

    // 2️⃣ Allocate months
    let monthCursor = paymentMonth;

    while (remaining > 0) {
        if (remaining >= expectedAmount) {
            monthPaid.push({ month: monthCursor, amount: expectedAmount });
            statusArr.push({ month: monthCursor, state: "complete" });
            remaining -= expectedAmount;
            monthCursor = nextMonth(monthCursor);
        } else {
            monthPaid.push({ month: monthCursor, amount: remaining });
            less = { amount: expectedAmount - remaining, dueMonth: monthCursor };
            statusArr.push({ month: monthCursor, state: "incomplete" });
            remaining = 0;
        }
    }

    /* ---------------- FINAL WRITE ---------------- */
    await paymentRef.set({
        transID: checkoutRequestId,
        plotName,
        units,
        amount: {
            mpesa: mpesaAmount || null,
            cash: cashAmount || null,
            total: totalAmount
        },
        phone: resolvedPhone,
        name: resolvedName,
        time: formatTime(transTime),
        source: "STK",
        monthPaid,
        less,
        status: statusArr,
        createdAt: new Date()
    });
};
