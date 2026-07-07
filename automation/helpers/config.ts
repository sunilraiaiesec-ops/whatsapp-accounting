/**
 * Shared constants for the tutorial automation framework.
 *
 * `BANTOO_BASE_URL` defaults to a local dev server so nobody accidentally
 * points a script at production just by running it. To record against the
 * real app, export `BANTOO_BASE_URL=https://books.bantoobooks.com` before
 * running the script (see automation/README.md).
 *
 * The demo credentials below are for a fictional practice organization
 * ("Central Distribution Cameroon SARL") seeded specifically for tutorials
 * and demo recordings — they are not a real customer's account and are
 * already documented openly elsewhere in this project. They can still be
 * overridden via env vars if the demo org's password ever rotates.
 */

export const BANTOO_BASE_URL =
  process.env.BANTOO_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:3000";

export const DEMO_EMAIL = process.env.BANTOO_DEMO_EMAIL?.trim() || "central.demo@bantoobooks.com";

export const DEMO_PASSWORD = process.env.BANTOO_DEMO_PASSWORD?.trim() || "DemoBooks2025!";

export const DEMO_ORG_NAME = "Central Distribution Cameroon SARL";

/**
 * Timing/motion knobs shared by every helper. Tuned for "slow enough that a
 * screen recorder captures a clean, human-paced walkthrough" rather than for
 * fast CI execution — this framework is a recording tool, not a test suite.
 */
export const PACE = {
  /** Default pause after a meaningful step (form fill, submit, navigation). */
  pauseSeconds: 2.5,
  /** Per-character delay while typing, in ms. */
  typeDelayMs: 55,
  /** Intermediate steps used to animate the mouse from A to B. */
  mouseMoveSteps: 28,
  /** Total wall-clock time budget for one mouse move animation, in ms. */
  mouseMoveMs: 550,
  /** How long an element stays visibly highlighted before it's clicked. */
  highlightMs: 700,
  /** Extra settle time after a smooth scroll-into-view. */
  scrollSettleMs: 500,
};
