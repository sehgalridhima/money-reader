/* ===============================================================
   THE ONLY ENDPOINT
   ===============================================================
   The whole server side of this app is one route that takes a list
   of payee names and returns a label for each.

   It cannot receive a statement, because nothing sends it one. It
   cannot receive an amount, a date, a balance or an account number,
   because the schema below rejects anything that is not a short
   string and the browser has no code that would send them. That is
   worth stating as a property of the design rather than a promise:
   there is no upload endpoint to misuse.
   =============================================================== */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/known-merchants.mjs";
import { claimCategorise } from "@/lib/budget";

/** A statement with more unfamiliar payees than this is unusual. */
const MAX_NAMES = 40;

/** Long enough for any real merchant, short enough to be a name. */
const MAX_NAME_LENGTH = 60;

/*
 * Rate limiting, and an honest description of what it is worth. This
 * is a Map in module scope, so each serverless instance keeps its
 * own and the real ceiling is however many instances exist — a brake
 * rather than a wall. It is here to stop one person looping, and that
 * is all it was ever able to do.
 *
 * The wall it could not be is now underneath it: a site-wide daily
 * budget in Postgres, where the increment and the check happen in one
 * atomic statement (src/lib/budget.ts). The two guard different
 * things and both are worth having — this one stops one visitor
 * hammering the button, that one stops a busy afternoon spending a
 * month of credit.
 *
 * Under both of those, unchanged: the Anthropic balance with
 * auto-reload off. Spending cannot exceed what has been paid for, so
 * the worst case here has never been a bill — it is this site, and
 * Eloquence and Lead Scout alongside it, going quiet until a top-up.
 */
const WINDOW_MS = 60 * 60 * 1000;

/*
 * Five, because a statement needs exactly one. Somebody reading a few
 * months in one sitting is the realistic maximum, and anything past
 * that is a loop rather than a person. Set against a bill of about
 * Rs 1.15 a call, the difference between this and a laxer number is
 * the difference between a nuisance and a bad afternoon.
 */
const PER_VISITOR = 5;
const visits = new Map<string, number[]>();

function overLimit(key: string): boolean {
  const now = Date.now();
  const recent = (visits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  visits.set(key, recent);
  if (recent.length >= PER_VISITOR) return true;
  recent.push(now);
  return false;
}

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
- A name that is a person rather than a business — two or three
  words, no company suffix, sometimes with an honorific like MR, MS
  or DR — is almost always "Transfers to people": money moved between
  family or friends, not a purchase.
- A small local eatery or shop, often the owner's name plus what they
  sell, is usually "Food & dining".
- Pay-later and EMI services are "Credit & loans", not shopping — the
  shopping happened somewhere else.
- Some names come with context: the payment address the money was
  collected at, and any note written on it. Trust that over the
  company's usual line of business — "EURONET SERVICES IND" is an ATM
  operator, but money collected at "GPAYRECHARGE2" was a phone
  recharge, so it is "Bills & utilities".

Set "sure" to false when the name genuinely could be several things —
a bare personal name that might be a shop, an unfamiliar abbreviation,
initials. Do not use false merely because you are being cautious: a
name you recognise should be marked true.`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Category lookup is not configured on this deployment." },
      { status: 503 },
    );
  }

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (overLimit(visitor)) {
    return NextResponse.json(
      {
        error:
          "That is five category lookups this hour, which is the cap. A statement only needs one, and this is the single part of the page that costs real money — it runs on one person's API credit. Everything else keeps working: reading a statement and every figure in the report never touches this.",
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const { names, hints } = (body ?? {}) as { names?: unknown; hints?: unknown };

  /*
   * Validated rather than trusted. Nothing in the app sends anything
   * but short name strings, so anything else arriving here is either
   * a bug or someone poking at it — and either way it should not
   * reach the model.
   */
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: "No names to look up." }, { status: 400 });
  }
  if (names.length > MAX_NAMES) {
    return NextResponse.json(
      { error: `That is more than ${MAX_NAMES} unfamiliar payees, which is more than a statement should have.` },
      { status: 400 },
    );
  }

  const clean = names
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && n.length <= MAX_NAME_LENGTH);

  if (!clean.length) {
    return NextResponse.json({ error: "No usable names in that request." }, { status: 400 });
  }

  const context: Record<string, string> = {};
  if (hints && typeof hints === "object") {
    for (const [name, hint] of Object.entries(hints as Record<string, unknown>)) {
      if (typeof hint === "string" && hint.length <= MAX_NAME_LENGTH && clean.includes(name)) {
        context[name] = hint.trim();
      }
    }
  }

  /*
   * The site-wide budget, claimed after the per-visitor check so that
   * someone looping spends their own allowance rather than the day's,
   * and after the request has been validated so that a malformed one
   * cannot drain the day without ever reaching the model.
   *
   * Not refunded if the call then fails — a failed call still costs
   * tokens often enough that pretending otherwise would make the
   * count a lie.
   */
  if (!(await claimCategorise())) {
    return NextResponse.json(
      {
        error:
          "This site has used its naming budget for today. It resets at midnight IST. Nothing else is affected: the report you are looking at was computed in your browser, and every figure in it is already final — the only thing missing is a friendlier label on payees the built-in list did not recognise.",
      },
      { status: 429 },
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      // Recall, not reasoning: the model either knows what Swiggy is
      // or it does not, and thinking harder about it only costs more.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Categorise these payee names:\n\n${clean
            .map((n) => (context[n] ? `${n} — context: "${context[n]}"` : n))
            .join("\n")}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");

    const out: Record<string, { category: string; sure: boolean }> = {};
    for (const m of parsed.merchants ?? []) {
      if (m?.name && CATEGORIES.includes(m.category)) {
        out[m.name] = { category: m.category, sure: m.sure !== false };
      }
    }

    return NextResponse.json({ categories: out });
  } catch (error) {
    console.error("[categorise] failed:", error);
    return NextResponse.json(
      {
        error:
          "The category lookup failed. Every figure on the page is unaffected — those were counted here, not asked for.",
      },
      { status: 502 },
    );
  }
}
