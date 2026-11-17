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
};
