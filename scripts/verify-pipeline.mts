/**
 * Pipeline logic tests.
 *
 * Same convention as verify-seo and verify-campaign: no network, no
 * database, plain objects in and assertions out. These are the parts where
 * a quiet arithmetic mistake would be invisible on screen but wrong in the
 * only number anybody acts on.
 */
import { annualised, conversion, effectiveProbability, forecast, weightedCents } from "./_libs/pipeline/forecast.ts";
import { findIssues, worstPriority } from "./_libs/pipeline/attention.ts";

let passed = 0;
let failed = 0;

function group(name: string) {
  console.log(`\n── ${name} ──`);
}
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`);
    failed++;
  }
}

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const dateOnly = (offsetDays: number) => iso(offsetDays).slice(0, 10);

group("probability: override beats stage default");
ok("no override falls back to the stage", effectiveProbability({ stage: "proposal", probability: null }) === 60);
ok("an override wins", effectiveProbability({ stage: "proposal", probability: 85 }) === 85);
ok("an override of 0 is respected, not treated as unset",
  effectiveProbability({ stage: "proposal", probability: 0 }) === 0);
ok("an unknown stage falls back to 20", effectiveProbability({ stage: "weird", probability: null }) === 20);

group("annualising: monthly and one-off are not the same size");
ok("$99/month annualises to $1,188", annualised(9900, "monthly") === 118800);
ok("a one-off is itself", annualised(399000, "one_time") === 399000);
ok("null is zero, not NaN", annualised(null, "one_time") === 0);

group("weighted value");
ok("$10,000 at 70% is $7,000",
  weightedCents({ valueCents: 1000000, billing: "one_time", stage: "proposal", probability: 70, expectedClose: null, committed: false }) === 700000);
ok("a monthly deal is annualised first",
  weightedCents({ valueCents: 9900, billing: "monthly", stage: "proposal", probability: 50, expectedClose: null, committed: false }) === 59400);

group("forecast");
const periodEnd = new Date(Date.now() + 20 * day);
const deals = [
  { valueCents: 400000, billing: "one_time", stage: "proposal", probability: 60, expectedClose: dateOnly(5), committed: true },
  { valueCents: 200000, billing: "one_time", stage: "qualified", probability: 25, expectedClose: dateOnly(10), committed: false },
  { valueCents: 800000, billing: "one_time", stage: "discovery", probability: 40, expectedClose: null, committed: false },
  { valueCents: 100000, billing: "one_time", stage: "won", probability: 100, expectedClose: dateOnly(-2), committed: false },
  { valueCents: 500000, billing: "one_time", stage: "lost", probability: 0, expectedClose: dateOnly(-3), committed: false },
];
const f = forecast({ deals, wonInPeriod: [{ valueCents: 100000, billing: "one_time" }], periodEnd, targetCents: 1000000 });

ok("pipeline counts only open deals", f.pipelineCents === 400000 + 200000 + 800000, f.pipelineCents);
// The won ($1,000) and lost ($5,000) deals must not be in there: if they
// were, the total would be 2,000,000 rather than 1,400,000.
ok("won and lost are excluded from pipeline", f.pipelineCents !== 2000000 && f.pipelineCents === 1400000, f.pipelineCents);
ok("weighted = sum of value x probability", f.weightedCents === 240000 + 50000 + 320000, f.weightedCents);
ok("best case needs a date inside the period AND >=50%", f.bestCaseCents === 400000, f.bestCaseCents);
ok("a deal with no close date is not best case", f.bestCaseCents !== 1200000);
ok("commit is the flag, not the probability", f.commitCents === 400000, f.commitCents);
ok("closed won comes from the period, not the stage list", f.closedWonCents === 100000, f.closedWonCents);
ok("gap = target - closed won", f.gapCents === 900000, f.gapCents);
ok("attainment = won / target", f.attainmentPct === 0.1, f.attainmentPct);

group("forecast with NO target: everything downstream is null");
const noTarget = forecast({ deals, wonInPeriod: [], periodEnd, targetCents: null });
ok("gap is null", noTarget.gapCents === null);
ok("attainment is null", noTarget.attainmentPct === null);
ok("projection is null", noTarget.projectedPct === null);
ok("but pipeline is still real", noTarget.pipelineCents === 1400000);

group("forecast with a ZERO target does not divide by zero");
const zeroTarget = forecast({ deals, wonInPeriod: [], periodEnd, targetCents: 0 });
ok("attainment is null rather than Infinity", zeroTarget.attainmentPct === null);
ok("gap is still computed", zeroTarget.gapCents === 0);

group("stage conversion reads the transition log");
const history = [
  { from_stage: null, to_stage: "qualified" },
  { from_stage: null, to_stage: "qualified" },
  { from_stage: null, to_stage: "qualified" },
  { from_stage: null, to_stage: "qualified" },
  { from_stage: "qualified", to_stage: "discovery" },
  { from_stage: "qualified", to_stage: "discovery" },
  { from_stage: "qualified", to_stage: "discovery" },
  { from_stage: "qualified", to_stage: "lost" },
  { from_stage: "discovery", to_stage: "proposal" },
];
const q2d = conversion(history, "qualified", "discovery");
ok("3 of 4 that entered Qualified moved to Discovery", q2d.moved === 3 && q2d.entered === 4, q2d);
ok("that is 75%", q2d.pct === 0.75, q2d.pct);
const never = conversion(history, "negotiation", "won");
ok("a stage nobody entered gives null, not 0%", never.pct === null && never.entered === 0);

group("deals needing attention");
const healthy = {
  stage: "proposal", valueCents: 100000, probability: 60,
  expectedClose: dateOnly(14), daysInStage: 2, lastActivityAt: iso(-1),
  nextAction: "Call Thursday", nextActionAt: iso(3), owner: "John",
  hasProposal: true, committed: false,
};
ok("a healthy deal raises nothing", findIssues(healthy).length === 0, findIssues(healthy));

const codes = (o: Partial<typeof healthy>) => findIssues({ ...healthy, ...o }).map((i) => i.code);
ok("close date passed", codes({ expectedClose: dateOnly(-4) }).includes("close_passed"));
ok("quiet for 9 days", codes({ lastActivityAt: iso(-9) }).includes("no_activity"));
ok("high value + quiet is escalated to high",
  findIssues({ ...healthy, valueCents: 500000, lastActivityAt: iso(-9) }).find((i) => i.code === "no_activity")?.priority === "high");
ok("stuck in proposal past 10 days", codes({ daysInStage: 21 }).includes("stuck"));
ok("no next action", codes({ nextAction: null }).includes("no_next_action"));
ok("overdue next action", codes({ nextActionAt: iso(-2) }).includes("next_action_overdue"));
ok("in proposal with no proposal", codes({ hasProposal: false }).includes("no_proposal"));
ok("no owner", codes({ owner: null }).includes("no_owner"));
ok("committed at 30% contradicts itself",
  codes({ committed: true, probability: 30 }).includes("commit_mismatch"));
ok("committed at 80% does not", !codes({ committed: true, probability: 80 }).includes("commit_mismatch"));
ok("won deals are never flagged", findIssues({ ...healthy, stage: "won", nextAction: null, owner: null }).length === 0);
ok("lost deals are never flagged", findIssues({ ...healthy, stage: "lost", nextAction: null, owner: null }).length === 0);
ok("worst priority surfaces correctly",
  worstPriority(findIssues({ ...healthy, expectedClose: dateOnly(-4), nextAction: null })) === "high");
ok("no issues gives null priority", worstPriority([]) === null);

console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
