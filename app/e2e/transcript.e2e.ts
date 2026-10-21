import { test as base, expect, type Page } from "@playwright/test";

import { strings } from "../src/strings";

const LONG = { timeout: 120_000 };

/** A dropped stream ends its response early; the browser logs that, and the transcript shows it. */
const EXPECTED_ERRORS = ["ERR_INCOMPLETE_CHUNKED_ENCODING"];

/** Every test also fails on an unexpected console error or uncaught exception. */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !EXPECTED_ERRORS.some((e) => text.includes(e))) errors.push(text);
      });
      page.on("pageerror", (error) => errors.push(String(error)));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

async function openThread(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByRole("status", { name: strings.transcript.loadingLabel })).toBeHidden(LONG);
}

async function send(page: Page, text: string) {
  await page.locator("textarea").fill(text);
  await page.locator("textarea").press("Enter");
}

const done = (page: Page) => page.getByText(strings.turn.done).last();

test("a full turn: sub-agents, artifacts and a question answered in one go", async ({ page }) => {
  await openThread(page, "Q3 launch review");
  await send(page, "Yes, break it down");

  await expect(page.getByRole("button", { name: strings.questions.send })).toBeVisible(LONG);
  await expect(page.locator("textarea")).toHaveAttribute("placeholder", strings.composer.locked.question);
  await expect(page.locator("textarea")).toBeDisabled();

  await page.getByLabel("Yes, draft it").check();
  await page.getByRole("button", { name: strings.questions.send }).click();
  await expect(done(page)).toBeVisible(LONG);
  await expect(page.locator("textarea")).toBeEnabled();
});

test("Stop keeps what arrived and says the turn was stopped", async ({ page }) => {
  await openThread(page, "Getting started");
  await send(page, "What can you do?");
  await page.getByRole("button", { name: strings.composer.stop }).click();

  await expect(page.getByText(strings.turn.stopped)).toBeVisible();
  await expect(page.getByRole("button", { name: strings.composer.send })).toBeVisible();
});

test("a dropped connection is interrupted, and Resume finishes the turn", async ({ page }) => {
  await openThread(page, "Berlin webinar attribution");
  await send(page, "Pull the report");

  await expect(page.getByText(strings.turn.droppedTitle)).toBeVisible(LONG);
  await page.getByRole("button", { name: strings.turn.resume }).click();
  await expect(done(page)).toBeVisible(LONG);
});

test("an error the assistant recovers from completes; one it doesn't fails", async ({ page }) => {
  await openThread(page, "CPC benchmark check");
  await send(page, "Compare CPCs");
  await expect(done(page)).toBeVisible(LONG);

  await send(page, "Use our history then");
  await expect(page.getByText(strings.turn.failed)).toBeVisible(LONG);
});

test("a silent stall is detected and the turn still completes", async ({ page }) => {
  await openThread(page, "Campaigns not to repeat");
  // The "Reconnecting" note shows only until the replay lands, too briefly to wait for;
  // the resume request is the proof that the silence was noticed.
  const reconnect = page.waitForRequest((request) => request.url().endsWith("/resume"), LONG);
  await send(page, "Which campaigns?");
  await reconnect;
  await expect(done(page)).toBeVisible(LONG);
});

test("streamed markdown settles into the final text without stray markers", async ({ page }) => {
  await openThread(page, "UTM audit script");
  await send(page, "Give me the script");
  await expect(done(page)).toBeVisible(LONG);

  const answer = page.locator("article").last().locator(".prose").last();
  await expect(answer).not.toContainText("**");
  await expect(answer.locator("table")).toBeVisible();
});

test("unknown content degrades in place and the turn completes", async ({ page }) => {
  await openThread(page, "Traffic anomalies");
  await send(page, "Anything unusual?");
  await expect(done(page)).toBeVisible(LONG);
  await expect(
    page
      .getByText(/can.t be shown/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("a v1 thread opens with a notice instead of an error", async ({ page }) => {
  await openThread(page, "HubSpot connection");
  await expect(page.getByText(strings.transcript.legacyNotice)).toBeVisible();
  await expect(page.getByText(strings.transcript.loadFailedTitle)).toBeHidden();
});

test("scroll: reading up is left alone, one click goes back to the bottom", async ({ page }) => {
  await openThread(page, "Always-on optimization log");
  await send(page, "Go");
  const scroller = page.locator("main .overflow-y-auto").first();
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight * 2), LONG).toBe(true);

  await scroller.evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(3_000); // content keeps arriving meanwhile
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThan(50);

  await page
    .getByRole("button", { name: new RegExp(`${strings.transcript.newContent}|${strings.transcript.backToLatest}`) })
    .click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(50);
});
