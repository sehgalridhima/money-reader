/* ===============================================================
   THE DAILY BUDGET
   ===============================================================
   One question, asked once per lookup: may this site spend another
   Rs 1.50 today?

   WHAT THIS SENDS, BECAUSE THIS PAGE MAKES A PROMISE ABOUT THAT

   Nothing. The request body is the two characters `{}`. No payee
   name, no amount, no date, no part of anyone's statement, and no
   identifier for the person asking — the counter is a single number
   per day for the whole site, not a number per visitor.

   The promise on the page is that a statement is read in the browser
   and never uploaded. That promise is unchanged: this call carries no
   statement, and it happens at the same moment the categorise request
   does, which the reader has already consented to by pressing the
   button. If this file ever needs to send something to count
   correctly, that is the point at which the promise would be at
   stake, and the answer then is to count worse rather than say less.

   WHY POSTGRES AND NOT A COUNTER IN THIS FILE

   Because a counter here lives in one serverless instance's memory,
   and how many instances exist is Vercel's decision. "20 a day" then
   means "20 per instance per day", which is weakest exactly when
   traffic is heaviest. The increment and the check happen in one
   atomic statement on the far side, and the limit itself lives in the
   migration — the key this file uses is public, and a limit you can
   pass as an argument is not a limit.

   No SDK. This is one POST; @supabase/supabase-js would be more
   dependency than function.
   =============================================================== */

const STORE_URL = process.env.SUPABASE_URL;
const STORE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

/** Long enough for a cold Postgres connection, short enough that a
 *  hanging store does not hold a categorise request open. */
const TIMEOUT_MS = 4_000;

/*
 * Only used when the store cannot be reached. It mirrors the number in
 * the migration by hand, which is the one duplicated fact here and is
 * worth the trouble: the alternative is that a Supabase blip leaves
 * the site entirely unguarded.
 */
const FALLBACK_DAILY_LIMIT = 20;
const fallbackCount = { day: "", count: 0 };

/** The day as Postgres reckons it, so the two counters roll over
 *  together. India, not UTC — a day that ends at 5:30am is nobody's
 *  idea of a day. */
function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Claim one categorise call against today's budget.
 *
 * Returns false when the budget is spent. Claiming is the same act as
 * asking, deliberately: a check that does not consume can be raced,
 * and two requests arriving together would both be told yes.
 */
export async function claimCategorise(): Promise<boolean> {
  if (!STORE_URL || !STORE_KEY) {
    console.warn("[budget] no store configured — counting in memory only");
    return claimFromMemory();
  }

  try {
    const response = await fetch(`${STORE_URL}/rest/v1/rpc/claim_categorise`, {
      method: "POST",
      headers: { apikey: STORE_KEY, "Content-Type": "application/json" },
      body: "{}",
      // This must never be cached. A cached "yes" is an unlimited yes.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`store returned ${response.status}`);
    return (await response.json()) === true;
  } catch (error) {
    /*
     * Falling back rather than refusing. Refusing would be the safer
     * arithmetic, but it hands anyone who can make Supabase slow an
     * off switch for the one paid feature — and the account's own
     * spend ceiling is still underneath all of this. So: keep serving,
     * count in memory, and say so loudly enough to find in the logs.
     */
    console.error("[budget] store unreachable, counting in memory:", error);
    return claimFromMemory();
  }
}

function claimFromMemory(): boolean {
  const day = today();
  if (fallbackCount.day !== day) {
    fallbackCount.day = day;
    fallbackCount.count = 0;
  }
  if (fallbackCount.count >= FALLBACK_DAILY_LIMIT) return false;
  fallbackCount.count += 1;
  return true;
}
