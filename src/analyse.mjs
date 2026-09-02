/* ===============================================================
   THE NUMBERS
   ===============================================================
   All of it arithmetic, none of it opinion. Every figure a person
   might act on is added up here, in whole paise, from transactions
   that have already been reconciled against the bank's own totals.

   Nothing in this file calls a model, and nothing in this file
   should ever start to. The moment a total becomes a guess, the
   report stops being a statement of what happened and becomes a
   plausible story about it — and there is no way for the reader to
   tell which one they are holding.
   =============================================================== */

import { readNarration, merchantKey } from "./merchant.mjs";

/**
 * A payment that repeats: same payee, roughly the same amount, at a
 * roughly regular spacing.
 *
 * Two are enough to notice, which is deliberately generous — over one
 * month a monthly subscription appears once and would otherwise be
 * invisible. An AUTOPAY mandate is treated as recurring on its own
 * evidence even when seen once, because the bank has already said so.
 */
const RECURRING_MIN = 2;

/** Amounts within this much of each other count as "the same". */
const AMOUNT_TOLERANCE = 0.15;

export function analyse(transactions) {
  const enriched = transactions.map((t) => {
    const read = readNarration(t.narration);
    return { ...t, ...read, key: merchantKey(read.merchant) };
  });

  const moneyIn = enriched.reduce((n, t) => n + t.credit, 0);
  const moneyOut = enriched.reduce((n, t) => n + t.debit, 0);

  const spending = enriched.filter((t) => t.debit > 0);
  const credits = enriched.filter((t) => t.credit > 0);

  /*
   * Money coming back is not money coming in. A cancelled Instamart
   * order returning ₹130 is not a ₹130 payday, and counting it as one
   * makes a month look better than it was. They are separated here
   * and reported separately — but both still sit inside moneyIn,
   * because moneyIn is what the bank credited and that figure has to
   * keep reconciling.
   */
  const isRefund = (t) => /refund|reversal|cancel|returned|chargeback/i.test(t.narration);
  const refunds = credits.filter(isRefund);
  const income = credits.filter((t) => !isRefund(t));

  return {
    transactions: enriched,
    period: period(enriched),
    moneyIn,
    moneyOut,
    net: moneyIn - moneyOut,
    openingBalance: enriched[0] ? enriched[0].balance + enriched[0].debit - enriched[0].credit : 0,
    closingBalance: enriched.at(-1)?.balance ?? 0,
    byMerchant: byMerchant(spending),
    incomeBySource: byMerchant(income, "credit"),
    recurring: recurring(enriched),
    largest: [...spending].sort((a, b) => b.debit - a.debit).slice(0, 5),
    refunds,
    refundTotal: refunds.reduce((n, t) => n + t.credit, 0),
    realIncome: income.reduce((n, t) => n + t.credit, 0),
    busiestDay: busiestDay(spending),
  };
}

function period(transactions) {
  if (!transactions.length) return null;
  const dates = transactions.map((t) => t.date).sort();
  const days =
    (new Date(dates.at(-1)) - new Date(dates[0])) / 86_400_000 + 1;
  return { from: dates[0], to: dates.at(-1), days: Math.round(days) };
}

function byMerchant(transactions, field = "debit") {
  const groups = new Map();

  for (const t of transactions) {
    const key = t.key ?? "(unnamed)";
    const group = groups.get(key) ?? {
      key,
      name: t.merchant ?? "Unnamed",
      total: 0,
      count: 0,
      transactions: [],
    };
    group.total += t[field];
    group.count += 1;
    group.transactions.push(t);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/**
 * Payments that look like they will happen again.
 *
 * Reported with the evidence that made each one qualify, because
 * "this is a subscription" is a claim the reader should be able to
 * check. A wrong one here sends somebody hunting for a cancellation
 * page that does not exist.
 */
function recurring(transactions) {
  const found = [];

  for (const group of byMerchant(transactions.filter((t) => t.debit > 0))) {
    const mandate = group.transactions.some((t) => t.isAutopay);
    const amounts = group.transactions.map((t) => t.debit);
    const typical = median(amounts);

    const steady =
      amounts.length >= RECURRING_MIN &&
      amounts.every((a) => Math.abs(a - typical) <= typical * AMOUNT_TOLERANCE);

    if (!mandate && !steady) continue;

    found.push({
      name: group.name,
      count: group.count,
      typical,
      total: group.total,
      // The bank's own word beats our pattern-matching, so say which.
      evidence: mandate
        ? "the bank records a standing AUTOPAY mandate"
        : `charged ${group.count} times at about the same amount`,
      certain: mandate,
      dates: group.transactions.map((t) => t.date),
    });
  }

  return found.sort((a, b) => Number(b.certain) - Number(a.certain) || b.total - a.total);
}

function busiestDay(spending) {
  const days = new Map();
  for (const t of spending) days.set(t.date, (days.get(t.date) ?? 0) + t.debit);
  const sorted = [...days.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0] ? { date: sorted[0][0], total: sorted[0][1] } : null;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
