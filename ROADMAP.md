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

## Priority 3

## Priority 4

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
