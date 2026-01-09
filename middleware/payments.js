import { db } from "../db/firebase.js";
import { formatTime } from "../utils/time.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const nextMonth = (monthStr) => {
    const [m, y] = monthStr.split("-");
    let idx = MONTHS.indexOf(m);
    let year = Number(y);

    idx++;
    if (idx === 12) {
        idx = 0;
        year++;
    }

    return `${MONTHS[idx]}-${year}`;
};

export const reconcileC2BPayment = async (c2bDoc) => {
    const {
        amount: mpesaAmount,
        cashAmount = 0,
        phone: hashedMSISDN,
        transId,
        rawPayload
    } = c2bDoc;

    // 🔁 Idempotency
    const existing = await db.collection("payments").doc(transId).get();
    if (existing.exists) return;

    const totalAmount =
        (Number(mpesaAmount) || 0) + (Number(cashAmount) || 0);

    let plotName = "Unknown";
    let units = null;
    let resolvedName = "Unknown";
    let resolvedPhone = hashedMSISDN;
    let expectedAmount = null;
    let isRecognized = false;

    // 🔍 Resolve plot + expected
    const plotsSnap = await db.collection("plots").get();

    plotsSnap.forEach((doc) => {
        const plot = doc.data();

        // ===== LUMPSUM =====
        if (plot.plotType === "lumpsum" && plot.MSISDN === hashedMSISDN) {
            isRecognized = true;
            expectedAmount = Number(plot.lumpsumExpected);
            plotName = plot.name;
            units = Number(plot.units || 1);
            resolvedName = plot.name;
            resolvedPhone = plot.mpesaNumber ?? hashedMSISDN;
        }

        // ===== INDIVIDUAL =====
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

    // ❌ Unrecognized payment
    if (!isRecognized || expectedAmount == null) {
        await db.collection("payments").doc(transId).set({
            transID: transId,
            plotName: "Unknown",
            units: null,
            amount: {
                mpesa: mpesaAmount || null,
                cash: cashAmount || null,
                total: totalAmount
            },
            phone: resolvedPhone,
            name: "Unknown",
            time: formatTime(rawPayload.TransTime),
            source: "C2B",
            monthPaid: [],
            less: null,
            status: [{ state: "unrecognized" }],
            createdAt: new Date()
        });
        return;
    }

    // 🔎 Fetch last unresolved LESS (if any)
    const prevSnap = await db.collection("payments")
        .where("phone", "==", resolvedPhone)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

    let carriedLess = null;
    if (!prevSnap.empty) {
        const prev = prevSnap.docs[0].data();
        if (prev.less && prev.less.amount > 0) {
            carriedLess = prev.less;
        }
    }

    let remaining = totalAmount;
    let monthPaid = [];
    let status = [];
    let less = null;

    let currentMonth = formatTime(rawPayload.TransTime, "MMM-YYYY");

    // 🧹 1. Clear previous LESS first
    if (carriedLess) {
        const due = carriedLess.amount;

        if (remaining >= due) {
            monthPaid.push({ month: carriedLess.dueMonth, amount: due });
            status.push({ month: carriedLess.dueMonth, state: "complete" });
            remaining -= due;
        } else {
            monthPaid.push({ month: carriedLess.dueMonth, amount: remaining });
            less = {
                amount: due - remaining,
                dueMonth: carriedLess.dueMonth
            };
            status.push({ month: carriedLess.dueMonth, state: "incomplete" });
            remaining = 0;
        }
    }

    // 🧮 2. Allocate remaining to months
    let monthCursor = currentMonth;

    while (remaining > 0) {
        if (remaining >= expectedAmount) {
            monthPaid.push({ month: monthCursor, amount: expectedAmount });
            status.push({ month: monthCursor, state: "complete" });
            remaining -= expectedAmount;
            monthCursor = nextMonth(monthCursor);
        } else {
            monthPaid.push({ month: monthCursor, amount: remaining });
            less = {
                amount: expectedAmount - remaining,
                dueMonth: monthCursor
            };
            status.push({ month: monthCursor, state: "incomplete" });
            remaining = 0;
        }
    }

    // 🧾 Persist
    await db.collection("payments").doc(transId).set({
        transID: transId,
        plotName,
        units,
        amount: {
            mpesa: mpesaAmount || null,
            cash: cashAmount || null,
            total: totalAmount
        },
        phone: resolvedPhone,
        name: resolvedName,
        time: formatTime(rawPayload.TransTime),
        source: "C2B",
        monthPaid,
        less,
        status,
        createdAt: new Date()
    });
};
