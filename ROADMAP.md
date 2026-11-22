# Roadmap

This file lists the open work for the Sourdough PWA.
The list uses priorities. Priority 1 is the highest priority.
Do the work in priority order, unless the maintainer gives a different order.

Rules for this file:

- Write in ASD-STE100 Simplified Technical English.
- Add one entry for each open item. Do not give an entry a status. Each entry in this file is open.
- Remove an entry in the pull request that completes it.
- Each entry names the code location, the goal and the acceptance test.
- Each entry has a `Rank` line with the model, the total score, the four single scores and the effort size. See "Rules for ranking".
- Put each entry in the priority that matches its total score. Order the entries inside a priority by total score, highest first.
- Priority 1 is the exception. It holds critical bugs and has no score band.
- Do not add area labels or category headers.

## Priority 1: Critical faults

## Priority 2

### Send a notification at the peak and before the feed deadline (`peak-deadline-notifications`)

- **Rank:** Feature model. Total 26/40 (baking 8, usability 5, harmony 6, safety 7). Effort L. Estimate.
- **Code:** `src/main.ts`, `public/sw.js`, `src/sw.test.ts`, `index.html`.
- **Problem:** The phase and the deadline warning show only when the page is open. If the baker closes the app, the starter can pass the window end without a warning and starve.
- **Goal:** Add an opt-in button that requests the notification permission. Show a notification at the peak and at the start of the `urgent` deadline level. Cancel the notifications when the user resets or feeds again. Tell the user when the browser does not support the feature.
- **Acceptance test:** Unit tests calculate the two notification times from a schedule and cancel them after a reset. A test for the service worker shows a notification with the correct text. A manual test on a phone shows the notification with the app in the background.

## Priority 3

### Move the input validation out of `main.ts` and test it (`extract-form-validation`)

- **Rank:** Maintenance model. Total 24/40 (reach 7, safety 7, speed 5, unblocks 5). Effort M. Estimate.
- **Code:** `src/main.ts`, `src/validate.ts` (new), `src/validate.test.ts` (new).
- **Problem:** `src/main.ts` has about 500 lines. The checks for ratio, temperature, amount, start time and inventory and the German error texts are inside the render functions. No test covers them, so a change can break a check without a failed test.
- **Goal:** Move each check into a pure function in `src/validate.ts`. Each function returns either the valid value or the error text. The render functions of the tracker, the target calculator and the fridge tab use these functions.
- **Acceptance test:** Unit tests in `src/validate.test.ts` cover the limits of each field, for example 4 °C and 38 °C, an empty value and a value above the maximum. The current error texts stay the same. All tests in `src/tabs.test.ts` and `src/calc.test.ts` pass without change.

## Priority 4

### Record a feeding log with the last refreshments (`feeding-log`)

- **Rank:** Feature model. Total 20/40 (baking 6, usability 5, harmony 5, safety 4). Effort M. Estimate.
- **Code:** `src/calc.ts`, `src/calc.test.ts`, `src/main.ts`, `index.html`.
- **Problem:** The app forgets each refreshment when the user starts a new one. The baker cannot compare the calculated peak with the real peak, and cannot see how often the starter got food in the last days.
- **Goal:** Store a log entry with time, ratio, temperature and flour type for each "Jetzt füttern" click. Keep the last 20 entries. Show the log in a list with the time since the previous entry.
- **Acceptance test:** Unit tests add entries, drop the oldest entry after 20 entries and reject corrupt stored data. A manual test feeds two times and sees two entries in the correct order after a reload.

### Set the service worker cache name from the build (`sw-cache-version-from-build`)

- **Rank:** Maintenance model. Total 16/40 (reach 4, safety 6, speed 4, unblocks 2). Effort S. Estimate.
- **Code:** `public/sw.js`, `vite.config.ts`, `src/sw.test.ts`.
- **Problem:** The cache name `sauerteig-v2` is a constant in `public/sw.js`. The maintainer must change it by hand for each release that must delete old caches. If the maintainer forgets it, users keep old cache entries.
- **Goal:** Write the cache name during `vite build`, for example from the package version or a hash of the built files. Keep the network-first behavior for the app shell.
- **Acceptance test:** A test builds the app two times with different content and gets two different cache names. The existing tests in `src/sw.test.ts` pass.

## Priority 5

## Rules for ranking

Rate each entry with one of two models. Each model has four criteria. Each criterion has a value from 0 to 10. The total score is the sum, with a maximum of 40.
Both models use the same scale. Therefore, one priority table applies to both models.
Effort does not add to the total. Give the effort as a size: S (one small pull request), M (one large pull request), L (several pull requests).

**Feature model.** Use it for an entry that changes the web app behavior or UI:

1. **Baking:** How much does the feature help the practical sourdough workflow?
2. **Usability:** How clear and intuitive is the interaction and UI design?
3. **Harmony:** How well does the feature extend existing calculations and data?
4. **Safety:** How well does it prevent dough failure or over-fermentation? (10 means no risk).

**Maintenance model.** Use it for an entry that changes code structure, tests or tooling:

1. **Reach:** How many modules or features gain from the change?
2. **Safety:** How many bugs or regressions does the change prevent or find?
3. **Speed:** How much does the change speed up development?
4. **Unblocks:** How many other entries need this entry or become cheaper after it?

The mark `Estimate` means that the maintainer did not rate the entry. Replace the estimate when the maintainer rates the entry.

Put a new entry in the priority that matches its total score:

| Total score | Priority |
|---|---|
| 26 or more | 2 |
| 21 to 25 | 3 |
| 16 to 20 | 4 |
| below 16 | 5 |
