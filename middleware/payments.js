import { db } from "../db/firebase.js";
import { formatTime } from "../utils/time.js";

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const nextMonth = (monthStr) => {
  if (!monthStr || typeof monthStr !== "string") return monthStr;

  const [m, y] = monthStr.split("-");
  const idx = MONTHS.indexOf(m);

  if (idx === -1 || !y || isNaN(Number(y))) return monthStr;

  let nextIdx = idx + 1;
  let year = Number(y);

  if (nextIdx === 12) {
    nextIdx = 0;
    year++;
  }

  return `${MONTHS[nextIdx]}-${year}`;
};

export const reconcileC2BPayment = async (c2bDoc) => {
  const {
    amount: mpesaAmount,
    cashAmount = 0,
    phone: hashedMSISDN,
    transId,
    rawPayload
  } = c2bDoc;

  /* ---------------- IDEMPOTENCY ---------------- */
  const paymentRef = db.collection("payments").doc(transId);
  const exists = await paymentRef.get();
  if (exists.exists) return;

  const totalAmount =
    (Number(mpesaAmount) || 0) + (Number(cashAmount) || 0);

  let plotName = "Unknown";
  let units = null;
  let resolvedName = "Unknown";
  let resolvedPhone = hashedMSISDN;
  let expectedAmount = null;
  let isRecognized = false;

  /* ---------------- PAYMENT MONTH ---------------- */
  const paymentMonth = formatTime(
    rawPayload?.TransTime,
    "MMM-YYYY"
  );

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
          units = Number(plot.units || 1);
          resolvedName = t.name;
          resolvedPhone = t.phone ?? hashedMSISDN;
        }
      });
    }
  });

  /* ---------------- UNRECOGNIZED ---------------- */
  if (!isRecognized || !expectedAmount) {
    await paymentRef.set({
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

  /* ---------------- PREVIOUS LESS ---------------- */
  let carriedLess = null;

  try {
    const prevSnap = await db.collection("payments")
      .where("phone", "==", resolvedPhone)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!prevSnap.empty) {
      const prev = prevSnap.docs[0].data();
      if (prev.less?.amount > 0) carriedLess = prev.less;
    }
  } catch (_) {}

  /* ---------------- ALLOCATION (ADDITION ONLY) ---------------- */
  let remaining = totalAmount;
  let monthPaid = [];
  let statusArr = [];
  let less = null;

  // 1️⃣ Clear carried LESS first
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

  // 2️⃣ Allocate current & future months
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
    status: statusArr,
    createdAt: new Date()
  });
};
