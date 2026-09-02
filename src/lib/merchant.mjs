/* ===============================================================
   WHO WAS THIS PAID TO?
   ===============================================================
   A UPI narration is not prose. It is fields joined by hyphens:

     UPI-SWIGGY LIMITED-SWIGGY1ONLINE.GPAY@OKPAYAXIS-UTIB0000553-
     127606439041-UPI
     ^   ^             ^                             ^
     |   merchant      the payment address           bank + refs

   So the payee is the second field, and reading it is arithmetic
   rather than judgement. No model is needed to know that "SWIGGY
   LIMITED" is the name in "UPI-SWIGGY LIMITED-...", and asking one
   would be slower, cost money, and occasionally be wrong.

   What a model IS needed for is the next question — whether SWIGGY
   LIMITED is food or groceries — and that lives in categorise.mjs,
   where it is given the names only and never the amounts.
   =============================================================== */

/**
 * A standing instruction the bank executes without asking again.
 *
 * HDFC writes these as UPI-AUTOPAY-<merchant>-..., which is why the
 * merchant is the third field in those and the second in every other.
 * This is the difference between a subscription and a one-off, and
 * the statement states it outright — so it is read, not inferred.
 */
const AUTOPAY = /^AUTOPAY$/i;

/** Names the bank uses for itself, which are not merchants. */
const NOT_A_MERCHANT = /^(UPI|NA|NULL|PAYMENT|COLLECT|PAY)$/i;

export function readNarration(narration) {
  const raw = String(narration ?? "");
  const fields = raw.split("-");

  const kind = fields[0]?.toUpperCase() ?? "";
  const isUpi = kind === "UPI";

  let merchant = null;
  let isAutopay = false;
  let vpaAt = -1;

  if (isUpi && fields.length > 1) {
    if (AUTOPAY.test(fields[1]?.trim() ?? "")) {
      isAutopay = true;
      merchant = fields[2];
      vpaAt = 3;
    } else {
      merchant = fields[1];
      vpaAt = 2;
    }
  } else {
    // Not a UPI line — NEFT, ATM, charges, interest. The first field
    // is the best name available and is usually the right one.
    merchant = fields[0];
  }

  merchant = tidy(merchant);
  if (!merchant || NOT_A_MERCHANT.test(merchant)) merchant = null;

  return {
    merchant,
    isAutopay,
    method: isUpi ? "UPI" : (tidy(fields[0]) || "OTHER").toUpperCase(),
    /*
     * The local part of the payment address — the bit before the @.
     * Merchants encode what the payment was for in it, and it is
     * often the only field that says: EURONET SERVICES IND is an ATM
     * operator, but it collected this one at GPAYRECHARGE2@okpayaxis,
     * so the payment was a phone recharge. The note field said only
     * "UPIINTENT", which is true of half the statement.
     *
     * Everything after the @ is the bank's handle and carries nothing.
     */
    handle: vpaAt >= 0 ? tidy(fields[vpaAt]?.split("@")[0]) || null : null,
    /*
     * The tail of the narration, which is where the payer writes what
     * the payment was for: "LAZYPAY REPAYMENT", "YOU ARE PAYING FOR",
     * "TECH LAW BOOTCAMP". Often noise, occasionally the only thing
     * that explains a payment.
     */
    note: tidy(fields.at(-1)) || null,
  };
}

/**
 * A name that can be compared across statements.
 *
 * "SWIGGY LIMITED", "Swiggy Ltd" and "SWIGGY  LIMITED" are one
 * merchant, and recurring detection only works if they collapse to
 * one key. The suffixes go because a company changing how it writes
 * its own name should not look like a new payee.
 */
export function merchantKey(merchant) {
  if (!merchant) return null;
  return (
    merchant
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(
        /\b(PVT|PRIVATE|PRI|LTD|LIMITED|LT|INDIA|IND|SERVICES|SERVICE|TECHNOLOGIES|TECH|SOLUTIONS|CO|COMPANY|INC)\b/g,
        " ",
      )
      /*
       * Spaces go last and go entirely. The same statement contains
       * both "LAZY PAY" and "LAZYPAY" for one company, which showed
       * up as two payees of ₹336 and ₹562 — and, worse, hid a
       * repeating payment, because neither half was charged twice.
       *
       * Removing spaces cannot merge two merchants that differ by
       * more than spacing, so the risk this adds is small and the
       * bug it fixes is one the reader could not have spotted.
       */
      .replace(/\s+/g, "") || null
  );
}

function tidy(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
