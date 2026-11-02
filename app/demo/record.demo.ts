import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import gifenc from "gifenc";
import { PNG } from "pngjs";

import { strings } from "../src/strings";

const { applyPalette, GIFEncoder, quantize } = gifenc;

const OUTPUT = new URL("../../docs/demo.gif", import.meta.url).pathname;
const FRAME_MS = 150;
const HOLD_LAST_MS = 3000;
const LONG = { timeout: 120_000 };

type Frame = { png: Buffer; ms: number };

/** Screenshots the page every FRAME_MS until stopped; a frame identical to the last one just lasts longer. */
function startCapture(page: Page) {
  const frames: Frame[] = [];
  let running = true;
  const loop = (async () => {
    let last = Date.now();
    while (running) {
      const png = await page.screenshot();
      const now = Date.now();
      const previous = frames.at(-1);
      if (previous?.png.equals(png)) previous.ms += now - last;
      else frames.push({ png, ms: now - last });
      last = now;
      await page.waitForTimeout(Math.max(0, FRAME_MS - (Date.now() - now)));
    }
  })();
  return async () => {
    running = false;
    await loop;
    return frames;
  };
}

function encode(frames: Frame[]): Uint8Array {
  const gif = GIFEncoder();
  frames.forEach(({ png }, i) => {
    const { data, width, height } = PNG.sync.read(png);
    const rgba = new Uint8Array(data);
    const palette = quantize(rgba, 256);
    // Each frame is shown for the time until the next one was taken.
    const delay = i === frames.length - 1 ? HOLD_LAST_MS : frames[i + 1].ms;
    gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay });
  });
  gif.finish();
  return gif.bytes();
}

test("record the README demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Q3 launch review" }).click();
  await expect(page.getByRole("status", { name: strings.transcript.loadingLabel })).toBeHidden(LONG);

  const stop = startCapture(page);
  await page.waitForTimeout(800);
  await page.locator("textarea").pressSequentially("Yes, break it down", { delay: 45 });
  await page.locator("textarea").press("Enter");

  // The turn streams: thinking, a group of actions, the audience specialist, a chart, then a question.
  await expect(page.getByRole("button", { name: strings.questions.send })).toBeVisible(LONG);
  await page.waitForTimeout(1200);
  await page.getByLabel("Yes, draft it").check();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: strings.questions.send }).click();
  await expect(page.getByText(strings.turn.done).last()).toBeVisible(LONG);
  await page.waitForTimeout(500);

  const frames = await stop();
  writeFileSync(OUTPUT, encode(frames));
  console.log(`${OUTPUT}: ${frames.length} frames`);
});
