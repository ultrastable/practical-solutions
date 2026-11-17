// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Benefit-cost models by solution id, run by the generic engine in core/benefitcost. Inputs are the entry's own cited figures where it has one;
// every other link is marked source "assumption" at grade D so the page shows how much rests on judgement. The refinement loop replaces
// assumptions as graded evidence arrives. A solution with no model here is shown as "not yet estimated" and sits in the loop's queue.
export const MODELS = {
  chlorine: { id: 'chlorine', title: 'Chlorinate water where people collect it',
    // Cited: USD 28-72 per DALY averted (Kremer et al., NBER meta-analysis of 18 trials). Modelled as the DALYs a USD 100,000 programme averts.
    cost: { upfront: 100000, years: 1 },
    nodes: [
      { id: 'dalys', label: 'Child deaths and illness averted (DALYs)', kind: 'direct', amount: { kind: 'ci90', low: 100000 / 72, high: 100000 / 28, shape: 'lognormal' }, unit: 'daly', grade: 'A', source: 'Kremer et al., NBER working paper, 18 randomised trials (USD 28-72 per DALY averted)' },
      { id: 'household', label: 'Surviving children free caregiver time and household spending (consumption-doubling years per DALY)', kind: 'multiplier', parent: 'dalys', amount: { kind: 'ci90', low: 0.005, high: 0.1, shape: 'lognormal' }, unit: 'consumption_doubling_year', years: 5, grade: 'D', source: 'assumption' },
      { id: 'adoption-gap', label: 'Households that stop treating water they already treated (displacement, WELLBYs lost per DALY)', kind: 'unintended', parent: 'dalys', amount: { kind: 'ci90', low: 0.01, high: 0.3, shape: 'lognormal' }, unit: 'wellby', years: 1, grade: 'D', source: 'assumption' },
    ] },

  // Cited: cost per life saved USD 3,500 (2021) to 5,000 (2022) for Helen Keller Intl programmes (GiveWell). Modelled as the deaths a USD 100,000 programme averts.
  vita: { id: 'vita', title: 'Vitamin A supplementation', cost: { upfront: 100000, years: 1 },
    nodes: [{ id: 'deaths', label: 'Child deaths averted', kind: 'direct', amount: { kind: 'ci90', low: 100000 / 5000, high: 100000 / 3500, shape: 'lognormal' }, unit: 'death_averted', grade: 'B', source: 'GiveWell, How We Produce Impact Estimates (versions 2023-2024): USD 3,500-5,000 per life saved; effect from a 19-trial review, risk ratio 0.88 (0.83-0.93)' }] },
  // Cited: USD 5,500 per life saved, 2021 average (GiveWell, Against Malaria Foundation); about 30% of benefits are long-term economic outcomes. One published figure, so the interval is understated.
  itn: { id: 'itn', title: 'Insecticide-treated bed nets', cost: { upfront: 100000, years: 1 },
    nodes: [{ id: 'deaths', label: 'Child deaths averted', kind: 'direct', amount: 100000 / 5500, unit: 'death_averted', grade: 'B', source: 'GiveWell, How We Produce Impact Estimates (versions 2023-2024): USD 5,500 per life saved (2021); a single figure with no published interval' },
      { id: 'economic', label: 'Longer-term economic gains for children who survive (valued as extra death-equivalents per death averted)', kind: 'multiplier', parent: 'deaths', amount: 0.3 / 0.7, unit: 'death_averted', grade: 'C', source: 'GiveWell, How We Produce Impact Estimates (versions 2023-2024): about 30% of programme benefits come from improved long-term economic outcomes' }] },
  // Cited: USD 5,000 per life saved, 2022 average, New Incentives in Nigeria (GiveWell). Transferred to the Rajasthan entry, whose own trial reports coverage, not cost per life.
  immunisation: { id: 'immunisation', title: 'Reliable vaccination sessions with a small incentive', cost: { upfront: 100000, years: 1 },
    nodes: [{ id: 'deaths', label: 'Infant deaths averted', kind: 'direct', amount: 100000 / 5000, unit: 'death_averted', grade: 'C', source: 'GiveWell, How We Produce Impact Estimates (versions 2023-2024): USD 5,000 per life saved (2022, New Incentives in Nigeria), transferred to the Rajasthan design; no published interval' }] },
  // Cited: ICER USD 191 per year lived with disability averted at 2020 coverage, 2019 dollars (Healey et al., Evidence-Based Mental Health 2022; Zimbabwe). A YLD is the disability part of a DALY, so this understates years of life.
  'friendship-bench': { id: 'friendship-bench', title: 'Friendship Bench', cost: { upfront: 100000, years: 1 },
    nodes: [{ id: 'ylds', label: 'Years lived with disability averted', kind: 'direct', amount: 100000 / 191, unit: 'daly', grade: 'B', source: 'Healey et al. 2022, Evidence-Based Mental Health: USD 191 per YLD averted (Zimbabwe, 2019 dollars); no interval published' }] },
};

// Entries researched for a published cost per outcome without finding a usable one. The ignorance engine already lists each as a known unknown
// ("no quantified effect recorded"); this says what was searched, so the loop searches somewhere new. Removed from here when a model lands.
export const GAPS = {
  helmets: 'Published cost per death averted (about USD 11,000 in Vietnam, a simulation) exists, but valuing an adult death needs life-years and no cost per DALY was found.',
  tarl: 'The J-PAL cost-effectiveness page found had no Teaching at the Right Level figures; learning gains per dollar are not in WELLBYs without a link from test scores to wellbeing.',
};
