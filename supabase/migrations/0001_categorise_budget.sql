/*
 * THE DAILY BUDGET FOR CATEGORISING PAYEES
 *
 * Naming an unfamiliar payee is the one thing on this site that costs
 * money. Everything else — opening the PDF, every figure in the report,
 * the reconciliation against the bank's own totals — runs in the
 * reader's browser and costs nothing to serve.
 *
 * This table holds one row a day and one number in it. It holds no
 * payee, no amount and nothing identifying whoever asked; see the note
 * at the top of src/lib/budget.ts, which is the promise this file has
 * to keep.
 */

create table if not exists public.categorise_budget (
  day   date primary key,
  count integer not null default 0
);

alter table public.categorise_budget enable row level security;
-- No policies, deliberately. Every read and write goes through the
-- security-definer functions below, so the public key can spend the
-- budget and can do nothing else to the table.

/*
 * THE DAILY LIMIT LIVES HERE. It is the only copy.
 *
 * It was tempting to pass it in as an argument, which would have kept
 * the number next to the code that cares about it. That would also
 * have let anyone holding the anon key — which is everyone, it is
 * public — call claim_categorise(1000000). The limit has to sit on
 * this side of the boundary to mean anything.
 *
 * A statement of entirely unfamiliar payees costs about Rs 1.50, and
 * a statement needs exactly one call, so twenty is twenty statements
 * a day: roughly Rs 30 a day, Rs 900 a month at the very worst, and
 * the realistic figure is far below that because most payees are
 * matched offline against the built-in list and never reach the model.
 *
 * Raise it only when the account ceiling goes up. The ceiling is
 * shared with Eloquence and Lead Scout — all three spend the same
 * balance, so a day spent here is a day Eloquence does not have.
 */
create or replace function public.categorise_daily_limit()
returns integer
language sql
immutable
as $$ select 20 $$;

/* The day as this database reckons it. India, not UTC — a day that
 * ends at 5:30am is nobody's idea of a day. Written once, so the
 * counter and the reporter cannot disagree about when midnight is and
 * then agree perfectly whenever anyone checks during office hours. */
create or replace function public.categorise_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

/*
 * Claim one call, or refuse.
 *
 * Claiming and asking are the same act on purpose: a check that does
 * not consume can be raced, and two requests arriving together would
 * both be told yes.
 */
create or replace function public.claim_categorise()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
  today   date := categorise_today();
begin
  -- One statement, so it is atomic. If the day's count has already
  -- reached the limit the ON CONFLICT update matches no row, nothing
  -- is returned, and `claimed` stays null.
  insert into public.categorise_budget (day, count)
  values (today, 1)
  on conflict (day) do update
    set count = categorise_budget.count + 1
    where categorise_budget.count < categorise_daily_limit()
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

grant execute on function public.claim_categorise() to anon;

/* Read the day's state without spending any of it. */
create or replace function public.categorise_budget_status()
returns table (spent integer, allowed integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(b.count, 0),
    categorise_daily_limit()
  from (select categorise_today() as day) d
  left join public.categorise_budget b on b.day = d.day;
$$;

grant execute on function public.categorise_budget_status() to anon;

-- Yesterday's rows are of no use to anyone; this keeps the table from
-- growing a row a day forever.
--
-- NOTHING CALLS THIS. It needs a schedule and there is not one, which
-- is fine: a row a day is 365 rows a year of two small columns. It is
-- here so that the day it does matter, the answer is already written.
create or replace function public.prune_categorise_budget()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.categorise_budget
  where day < categorise_today() - 7;
$$;
