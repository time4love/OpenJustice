# Measuring the two era detectors — 2026-09-01

**Bears on: Level 4, build order steps 4–5 and the gate on automatic mode.**

A findings record, not a plan. Run against **staging** with
`forensics:measure-era-detectors`, which is read-only: it parses documents already held, reaches no
network and no model, and writes nothing. **No threshold is adopted here** — `src/` still carries none,
and the source scan that forbids one is untouched.

---

## WHAT WAS MEASURED

One selector set against every capture of a page, in date order. Two pages of **deliberately opposite
construction**, which is what the gate asked for:

| page | selectors | how they are named | captures | span |
|---|---|---|---|---|
| `news.walla.co.il/item/3403847` | 22 (era-1, version 38) | CSS-in-JS build hashes | 7 | 2020-12 → 2025-03 |
| `corona.health.gov.il/vaccine-for-covid/` | 9 (version 30) | authored / semantic | 83 | 2021-12 → 2026-03 |

---

## RESULT 1 — THE UNION WOULD NOT HAVE DETECTED THE BOUNDARY THAT CREATED IT

The same captures, under the era-1 ruleset and under the union of both eras:

| capture | era-1 (22) | union (35) |
|---|---|---|
| 2020-12-09 | 19/22 · **0.86** | 19/35 · 0.54 |
| 2020-12-18 | 19/22 · **0.86** | 19/35 · 0.54 |
| 2021-06-12 | 12/22 · 0.55 | 12/35 · 0.34 |
| **2022-05-23** | 5/22 · **0.23** | 16/35 · **0.46** |
| 2024-05-20 | 4/22 · 0.18 | 8/35 · 0.23 |
| 2025-02-19 | 3/22 · 0.14 | 7/35 · 0.20 |
| 2025-03-26 | 3/22 · 0.14 | 7/35 · 0.20 |

`2022-05-23` is a KNOWN redesign — the researcher marked it and the ruleset went 22 → 35.

- **Era-scoped**, it reads 0.23 against a 0.86 baseline: a ratio of **0.27**.
- **Under the union**, it reads 0.46 against a 0.54 baseline: a ratio of **0.85**, indistinguishable
  from a healthy capture.

**The union hides era boundaries from the detector, and this is the measurement rather than the
argument.** It was superseded on undecidability and verification cost; this says it would also have
been undetectable in operation.

## RESULT 2 — WITHIN-ERA MATCH-RATE VARIANCE IS ZERO, ON 90 CAPTURES

| page | within-era match rate |
|---|---|
| Walla, era 1 | 0.86 on both captures |
| MOH corona | **0.89 on all 83 captures, min = max**, across 4 years and 3 months |

The MOH page is the "authored names survive" finding measured at scale: nine selectors, eight matching,
unchanged from 2021-12-23 to 2026-03-05.

**This constrains the match-rate threshold only from above.** Observed variance is nil, so the data
says nothing about how much natural drift to tolerate — a threshold is justified by the SIZE OF THE
GAP, not by variation the corpus has shown.

## RESULT 3 — KEPT LENGTH DOES VARY WITHIN AN ERA, AND BOUNDS THE OTHER THRESHOLD

Over the MOH page's 83 captures under one unchanging ruleset:

```
min 3994   median 4796   max 5697
worst within-era ratio  min / median = 0.833
```

**`minKeptLengthRatio` must therefore sit below 0.833**, or the over-match detector fires on healthy
captures of a page nobody has touched. `0.70` leaves roughly sixteen points of headroom under the worst
observed case.

## RESULT 4 — THE DIRECTION OF THE LENGTH SIGNAL IS CONFIRMED

Under-matching RAISES kept text, because retained furniture is retained text: Walla's era-1 ruleset
keeps 2,461 characters where it applies and 6,412 where it has stopped.

So a **fall** is the over-match signal and a **rise** accompanies under-matching, which the match rate
already catches. The detector flags only a fall, and that is correct.

---

## CANDIDATE THRESHOLDS, AND WHAT EACH RESTS ON

| threshold | candidate | what justifies it |
|---|---|---|
| `minKeptLengthRatio` | **0.70** | measured: worst within-era ratio is 0.833 over 83 captures |
| `minBaselineSamples` | **3** | not measured — a judgement that two captures cannot establish a norm |
| `minMatchRateRatio` | **0.6–0.7** | the gap only: within-era 1.00, boundary 0.27, and one undecided point at 0.64 |

---

## WHAT IS NOT MEASURED, AND ONE OF IT IS SHARP

**The over-match detector has never seen an over-match.** No page in the corpus has been over-matched,
so `minKeptLengthRatio` is calibrated against NATURAL VARIATION and not against the failure it exists
to catch. Its false-positive rate is bounded by evidence; its false-negative rate is not. This is the
same shape as a success arm that has never fired.

**A THIRD PAGE.** The gate asks for three of different construction; two are measured.

**AND THE ONE CAPTURE THAT DECIDES THE MATCH-RATE THRESHOLD.** `2021-06-12` reads **0.55 — a ratio of
0.64** — with kept text jumping from 2,461 to 4,342, which is the shape of a ruleset meeting a page it
does not describe. **It has never been judged**: the maximin policy jumped from 2020-12-18 to 2025-03-26
and bisected to 2022-05-23, passing over it.

- If it is a REDESIGN, the threshold must be **above 0.64** and this page has three eras, not two.
- If it is NOT, the threshold must be **below 0.64**.

**One human verdict on one capture fixes the remaining number.** Nothing else in the measurement is
ambiguous.
