/* ===============================================================
   CATEGORIES — the only part that is a judgement
   ===============================================================
   Everything else in this project is arithmetic. This is not: no
   amount of parsing tells you that SWIGGY LIMITED is food and
   LAWSIKHO is education. Someone has to know what these companies
   are, and that is the one thing a model is genuinely better at than
   a regular expression.

   THE MODEL NEVER SEES YOUR MONEY. It is sent a list of names and
   nothing else — no amounts, no dates, no balances, no account
   number, not even how many times each name appeared. The reply is a
   label per name, which is joined back onto the transactions here,
   locally. A statement of 20 transactions from 15 payees sends 15
   short strings.

   That is not only a privacy decision, it is also why this is cheap
   and why the cache below works: names repeat every month, amounts
   never do.
   =============================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

/*
 * Names are stable, so an answer is worth keeping. The second run of
 * any month costs nothing, and a new month only asks about payees
 * that have not been seen before — usually a handful.
 */
const CACHE_FILE = "categories.json";

export const CATEGORIES = [
  "Food & dining",
  "Groceries",
  "Shopping",
  "Transport",
  "Bills & utilities",
  "Subscriptions",
  "Health",
  "Education",
  "Entertainment",
  "Transfers to people",
  "Credit & loans",
  "Cash & ATM",
  "Fees & charges",
  "Income",
  "Other",
];

/*
 * A schema, so the reply is a labelled list rather than prose that
 * has to be parsed. The model cannot answer with a category that is
 * not on the list, which matters: an invented category would quietly
 * become its own row in the spending breakdown.
 */
const SCHEMA = {
  type: "object",
  properties: {
    merchants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          /*
           * Asked for so that a guess can be shown as a guess. A
           * named restaurant chain is obviously food; a bare first
           * name could be a friend, a tutor, or a corner shop.
           * Presenting both with equal confidence is the dishonest
           * part.
           */
          sure: { type: "boolean" },
        },
        required: ["name", "category", "sure"],
        additionalProperties: false,
      },
    },
  },
  required: ["merchants"],
  additionalProperties: false,
};

const SYSTEM = `You label payee names from an Indian bank statement.

You are given only names, with no amounts and no dates — that is
deliberate, and you do not need them.

For each name, pick the single best category from the allowed list.

Notes on what these names look like:
- They come from UPI transactions, so they are often shouty and
  abbreviated: "SWIGGY LIMITED", "EURONET SERVICES IND".
- A name that is a *person* rather than a business — two or three
  words, no company suffix, sometimes with an honorific like MR, MS
  or DR — is almost always "Transfers to people": money moved between
  family or friends, not a purchase.
- A small local eatery or shop, often the owner's name plus what they
  sell, is usually "Food & dining".
- Pay-later and EMI services ("LAZYPAY", "SIMPL") are "Credit & loans",
  not shopping — the shopping happened somewhere else.
- Recharge and telecom ("AIRTEL", "JIO") are "Bills & utilities".
- Some names come with context: the payment address the money was
  collected at, and any note written on it. Trust that over the
  company's usual line of business — "EURONET SERVICES IND" is an ATM
  operator, but money collected at "GPAYRECHARGE2" was a phone
  recharge, so it is "Bills & utilities".

Set "sure" to false when the name genuinely could be several things —
a bare personal name that might be a shop, an unfamiliar abbreviation,
initials. Do not use false merely because you are being cautious: a
name you recognise should be marked true.`;

/**
 * A category for each name, from cache where possible.
 *
 * Returns a plain object keyed by name. Callers should treat a
 * missing name as uncategorised rather than as "Other" — not knowing
 * and knowing it is miscellaneous are different answers.
 */
export async function categorise(names, { model = "claude-opus-5", hints = {} } = {}) {
  const cache = loadCache();
  const unknown = [...new Set(names)].filter((n) => n && !cache[n]);

  if (!unknown.length) return { categories: cache, asked: 0, cached: names.length };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { categories: cache, asked: 0, cached: 0, missingKey: true };
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    /*
     * Low effort on purpose. This is recall, not reasoning — the
     * model either knows what Swiggy is or it does not, and thinking
     * harder about it would only cost more.
     */
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Categorise these payee names:\n\n${unknown
          .map((n) => (hints[n] ? `${n} — context: "${hints[n]}"` : n))
          .join("\n")}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A category is a nice-to-have. Losing it should never cost the
    // report, which is made of things that were counted rather than
    // decided.
    console.warn("[categorise] could not read the reply; skipping categories");
    return { categories: cache, asked: 0, cached: 0, failed: true };
  }

  for (const m of parsed.merchants ?? []) {
    if (m?.name && CATEGORIES.includes(m.category)) {
      cache[m.name] = { category: m.category, sure: m.sure !== false };
    }
  }

  saveCache(cache);

  return {
    categories: cache,
    asked: unknown.length,
    cached: names.length - unknown.length,
    usage: response.usage,
  };
}

/** Roughly what a call cost, in rupees, at Opus 5 list prices. */
export function estimateCostInr(usage) {
  if (!usage) return 0;
  const USD_PER_INR = 88;
  const inUsd = (usage.input_tokens / 1e6) * 5;
  const outUsd = (usage.output_tokens / 1e6) * 25;
  return (inUsd + outUsd) * USD_PER_INR;
}

function loadCache() {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}
