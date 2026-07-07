/**
 * Internal support for slowClick's "smooth mouse movement" requirement.
 *
 * Important, non-obvious detail: Playwright's `page.mouse.move()` dispatches
 * synthetic input events straight to the renderer over CDP — it does NOT
 * move an OS-level cursor, so a screen recorder (Guidde, OBS, QuickTime...)
 * never sees anything move even if you animate `page.mouse.move` with many
 * steps. To make the automation look right on camera, we inject a small fake
 * cursor <div> into the page and animate its CSS position in lockstep with
 * the real (invisible) synthetic mouse moves. The real moves still matter
 * for functional realism (e.g. triggering `:hover` styles), the fake dot is
 * purely cosmetic for the recording.
 *
 * Not part of the public helpers/index.ts surface — slowClick.ts and
 * highlight.ts are the only callers.
 */

import type { Page } from "@playwright/test";
import { PACE } from "./config";

const CURSOR_ID = "__bantoo_automation_cursor__";

// Playwright doesn't expose "where is the mouse right now", so we track our
// own last-known position per page to animate smoothly from A to B.
const lastPosition = new WeakMap<Page, { x: number; y: number }>();

export async function ensureFakeCursor(page: Page): Promise<void> {
  await page.evaluate((id) => {
    if (document.getElementById(id)) return;
    const el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "fixed",
      zIndex: "2147483647",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "rgba(255, 90, 30, 0.9)",
      border: "2px solid white",
      boxShadow: "0 1px 6px rgba(0,0,0,0.55)",
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
      left: "-9999px",
      top: "-9999px",
    });
    document.body.appendChild(el);
  }, CURSOR_ID);
}

async function setFakeCursorPosition(page: Page, x: number, y: number): Promise<void> {
  await page
    .evaluate(
      ({ id, x, y }) => {
        const el = document.getElementById(id);
        if (el) {
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
        }
      },
      { id: CURSOR_ID, x, y },
    )
    .catch(() => {
      // The page may have navigated mid-animation; harmless to drop a frame.
    });
}

/** Smoothly animates both the real (invisible) mouse and the fake cursor dot to (x, y). */
export async function moveMouseSmoothly(page: Page, x: number, y: number): Promise<void> {
  await ensureFakeCursor(page);
  const viewport = page.viewportSize();
  const start = lastPosition.get(page) ?? {
    x: viewport ? viewport.width / 2 : x,
    y: viewport ? viewport.height / 2 : y,
  };

  const steps = PACE.mouseMoveSteps;
  const stepDelay = Math.max(1, Math.round(PACE.mouseMoveMs / steps));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 2); // ease-out, like a hand decelerating onto a target
    const stepX = start.x + (x - start.x) * eased;
    const stepY = start.y + (y - start.y) * eased;
    await page.mouse.move(stepX, stepY);
    await setFakeCursorPosition(page, stepX, stepY);
    await page.waitForTimeout(stepDelay);
  }
  lastPosition.set(page, { x, y });
}
