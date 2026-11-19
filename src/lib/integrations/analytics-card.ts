/**
 * What the Vercel Web Analytics card says, given the result of one real
 * request to Vercel. Plain logic, no server imports, so it can be tested.
 *
 * `probe` is null when no check was made (no token) and "timeout" when Vercel
 * did not answer in time. A timeout is not a failure: the card falls back to
 * "Keys set" rather than raising an alarm over a slow response.
 */

export type AnalyticsProbe =
  | { state: "ok"; pageviews: number; visitors: number }
  | { state: "not-enabled" }
  | { state: "error"; message: string }
  | "timeout"
  | null;

export type AnalyticsCard = {
  state: "connected" | "attention" | "keys_set" | "not_set_up";
  detail: string;
};

const n = (value: number) => value.toLocaleString("en-US");

export function analyticsCard(tokenSet: boolean, probe: AnalyticsProbe): AnalyticsCard {
  if (!tokenSet) return { state: "not_set_up", detail: "Not set up. Traffic panels show 'not connected'." };
  if (probe === null || probe === "timeout") {
    return { state: "keys_set", detail: "Token set. Vercel didn't answer the live check just now; traffic may still show on Analytics." };
  }
  if (probe.state === "ok") {
    return {
      state: "connected",
      detail: `Working. ${n(probe.pageviews)} page ${probe.pageviews === 1 ? "view" : "views"} from ${n(probe.visitors)} ${probe.visitors === 1 ? "visitor" : "visitors"} in the last 7 days.`,
    };
  }
  if (probe.state === "not-enabled") {
    return { state: "attention", detail: "Token set, but Web Analytics is not enabled on the Vercel project, or the project id is wrong." };
  }
  return { state: "attention", detail: probe.message };
}
