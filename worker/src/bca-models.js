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
  // Cited: 7.55 WELLBYs per USD 1,000 donated, household total (Happier Lives Institute, GiveDirectly summary, updated December 2024). No interval is published in the text.
  cash: { id: 'cash', title: 'Unconditional cash transfers', cost: { upfront: 1000, years: 1 },
    nodes: [{ id: 'household', label: 'Life satisfaction of the recipient household', kind: 'direct', amount: 7.55, unit: 'wellby', years: 1, grade: 'A', source: 'Happier Lives Institute, GiveDirectly comprehensive summary (December 2024): 7.55 WELLBYs per USD 1,000; recipient 2.10 and other household members 7.12 per transfer' },
      { id: 'neighbours', label: 'Spending lifts incomes of non-recipient neighbours (WELLBYs per household WELLBY)', kind: 'spillover', parent: 'household', amount: { kind: 'ci90', low: 0.02, high: 0.5, shape: 'lognormal' }, unit: 'wellby', years: 1, grade: 'D', source: 'assumption' },
      { id: 'prices', label: 'Local price rises for non-recipients (WELLBYs lost per household WELLBY)', kind: 'unintended', parent: 'household', amount: { kind: 'ci90', low: 0.005, high: 0.1, shape: 'lognormal' }, unit: 'wellby', years: 1, grade: 'D', source: 'assumption' }] },
};

// Entries researched for a published cost per outcome without finding a usable one. The ignorance engine already lists each as a known unknown
// ("no quantified effect recorded"); this says what was searched, so the loop searches somewhere new. Removed from here when a model lands.
export const GAPS = {
  helmets: 'A cost per death averted exists (about USD 11,000 in Vietnam, from a simulation), but deaths here are adult deaths and the cited value of a death averted is for children under 5. The loop searches for a cost per DALY.',
  tarl: 'The benefit is learning. No sourced link from test-score gains to life satisfaction was found, so it cannot yet be put in WELLBYs.',
  'mobile-money': 'The benefit is consumption and poverty exit across a country; no programme cost per household was found to divide it by.',
  'women-leaders': 'The benefit is a change in what councils fund. No quantified wellbeing effect or cost was found.',
  graduation: 'Consumption gains are reported, but no sourced cost per household with a consumption change in the same units was found.',
  'rural-electrification': 'The cited trial found little short-run benefit; no wellbeing effect is quantified.',
  'emissions-market': 'The benefit is lower particulate emissions; no sourced step from emissions to health in this setting was found.',
};
// Entries with a health outcome and no model yet. The loop searches for a cost per DALY (or per child death) and drafts a model from what it finds.
// A draft is shown as a lead, flagged, and kept out of the ranking until a second independent source within a factor of ten has been pooled.
export const QUEUE = {
  kmc: { per: 'death', unit: 'death_averted', label: 'Newborn deaths averted', query: '"kangaroo mother care"' },
  'ors-zinc': { per: 'daly', unit: 'daly', label: 'Illness and deaths averted (DALYs)', query: '"oral rehydration" AND zinc AND diarrhoea' },
  hypertension: { per: 'daly', unit: 'daly', label: 'Illness and deaths averted (DALYs)', query: 'hypertension AND (protocol OR "HEARTS") AND "primary care" AND (low-income OR middle-income)' },
  helmets: { per: 'daly', unit: 'daly', label: 'Injury and deaths averted (DALYs)', query: 'motorcycle helmet AND (law OR legislation)' },
  deworming: { per: 'daly', unit: 'daly', label: 'Illness averted (DALYs)', query: '"mass deworming" OR "school-based deworming"' },
  'clean-cooking': { per: 'daly', unit: 'daly', label: 'Illness and deaths averted (DALYs)', query: '("clean cooking" OR "LPG stove" OR cookstove) AND household air pollution' },
};

// Contexts: World Bank income groups. No cost or wellbeing multipliers are asserted per group because none has been sourced; what differs today is
// whether an entry applies at all (taken from the entry's own setting and limits) and whether its figures were measured there or transferred.
// Evidence the loop finds for one group is pooled into that group only (core/benefitcost context scoring).
export const CONTEXTS = [{ id: 'low', label: 'Low income' }, { id: 'lower-middle', label: 'Lower-middle income' }, { id: 'upper-middle', label: 'Upper-middle income' }, { id: 'high', label: 'High income' }];
const no = reason => ({ applies: false, reason }), here = {};
export const APPLIES = {
  chlorine: { low: here, 'lower-middle': here, high: no('Drinking water is already treated and piped to nearly every household.') },
  vita: { low: here, 'lower-middle': here, 'upper-middle': no('The benefit is shown only where children are vitamin A deficient, which is uncommon at this income level.'), high: no('Vitamin A deficiency in children is rare.') },
  itn: { low: here, 'lower-middle': here, high: no('Applies only where malaria is transmitted.') },
  immunisation: { 'lower-middle': here, high: no('Routine immunisation coverage is already high; the trial addressed very low coverage.') },
  'friendship-bench': { low: here, 'lower-middle': here },
  cash: { low: here, high: no('USD 1,000 is a small share of household income here, and the wellbeing gain from income falls as income rises.') },
};
// What the evidence finder searches for, per model: the node the figure updates and the unit a cost is quoted in.
export const FINDERS = {
  chlorine: { node: 'dalys', per: 'daly', query: 'water chlorination OR "point-of-use water treatment"' },
  'friendship-bench': { node: 'ylds', per: 'daly', query: '"Friendship Bench" OR ("problem-solving therapy" AND "lay health worker")' },
  vita: { node: 'deaths', per: 'death', query: '"vitamin A supplementation" AND child mortality' },
  itn: { node: 'deaths', per: 'death', query: '"insecticide-treated nets" AND child mortality' },
  immunisation: { node: 'deaths', per: 'death', query: 'immunisation incentives OR "conditional cash transfer" vaccination infants' },
};
