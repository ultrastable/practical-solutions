// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// How implementable a solution is, scored by a published rule from four structured facts. Impact needs implementation, so this ranks the encyclopedia.
// cost: low | medium | high (cost to one implementer to start; `cost_note` says why). adoption: scaled (run at national or multi-country scale) |
// piloted (run beyond the trial by programmes) | trial-only. channel: an existing delivery channel that can carry it, or null. actors: who holds the remit and money.
// The facts are the maintainers' reading of the cited sources and are shown beside the score so a reader can disagree with them.
export const IMPL = {
  kmc: { cost: 'low', cost_note: 'No equipment; training and a ward corner', adoption: 'scaled', channel: 'newborn wards and national newborn programmes', actors: 'ministries of health, district hospitals' },
  'ors-zinc': { cost: 'low', cost_note: 'A few cents a course', adoption: 'scaled', channel: 'clinics, community health workers, essential-medicines lists', actors: 'ministries of health, procurement units' },
  chlorine: { cost: 'low', cost_note: 'Cents per person per year', adoption: 'scaled', channel: 'village water points and NGO dispenser networks', actors: 'water authorities, Evidence Action, village committees' },
  itn: { cost: 'medium', cost_note: 'Nets every 3 years plus resistance monitoring', adoption: 'scaled', channel: 'national malaria campaigns', actors: 'national malaria programmes, Global Fund' },
  tarl: { cost: 'low', cost_note: 'Regrouping and a trained volunteer or teacher', adoption: 'scaled', channel: 'primary schools and education departments', actors: 'education ministries, Pratham and partners' },
  immunisation: { cost: 'medium', cost_note: 'Staffed camps and incentives', adoption: 'piloted', channel: 'district immunisation services', actors: 'district health officers' },
  vita: { cost: 'low', cost_note: 'A few cents per capsule', adoption: 'scaled', channel: 'immunisation contacts and campaigns', actors: 'national nutrition programmes' },
  cash: { cost: 'high', cost_note: 'The transfer itself is the cost', adoption: 'scaled', channel: 'mobile money and social-protection payment systems', actors: 'social-protection ministries, GiveDirectly' },
  hypertension: { cost: 'medium', cost_note: 'Generic drugs, registry, nurse follow-up', adoption: 'scaled', channel: 'primary care, WHO HEARTS package', actors: 'primary-care networks, ministries of health' },
  'friendship-bench': { cost: 'low', cost_note: 'Lay worker training and supervision', adoption: 'scaled', channel: 'primary-care clinics', actors: 'municipal health departments' },
  helmets: { cost: 'low', cost_note: 'A law, enforcement and a standard', adoption: 'scaled', channel: 'traffic police and vehicle licensing', actors: 'transport ministries, road-safety agencies' },
  'rural-electrification': { cost: 'high', cost_note: 'Grid extension per household', adoption: 'scaled', channel: 'national utilities', actors: 'electricity utilities, development banks' },
  'mobile-money': { cost: 'medium', cost_note: 'Regulation plus an agent network', adoption: 'scaled', channel: 'mobile network operators and agent shops', actors: 'central banks, telecom regulators' },
  'women-leaders': { cost: 'low', cost_note: 'A rule on candidate slots', adoption: 'scaled', channel: 'party and electoral rules', actors: 'legislatures, parties, electoral commissions' },
  graduation: { cost: 'high', cost_note: 'Asset plus two years of coaching per household', adoption: 'scaled', channel: 'BRAC and government social-protection programmes', actors: 'social-protection ministries, BRAC' },
  deworming: { cost: 'low', cost_note: 'Cheap tablets', adoption: 'scaled', channel: 'school health programmes', actors: 'education and health ministries' },
  'clean-cooking': { cost: 'high', cost_note: 'Stove plus continuing fuel supply', adoption: 'piloted', channel: 'clean-cooking programmes', actors: 'energy ministries' },
  'emissions-market': { cost: 'high', cost_note: 'Monitors and a market platform', adoption: 'trial-only', channel: null, actors: 'state pollution control boards' },
};
const COST = { low: 3, medium: 2, high: 1 }, ADOPT = { scaled: 3, piloted: 2, 'trial-only': 1 };
export const MIN_PRACTICAL = 5;

// Score 3-8: cost (1-3) + adoption (1-3) + an existing delivery channel (2 or 0). Below MIN_PRACTICAL a solution is held back from the main list.
export function implementability(id) {
  const f = IMPL[id];
  if (!f) return null;
  const score = COST[f.cost] + ADOPT[f.adoption] + (f.channel ? 2 : 0);
  return { ...f, score, practical: score >= MIN_PRACTICAL, band: score >= 7 ? 'ready to implement' : score >= MIN_PRACTICAL ? 'implementable with effort' : 'not yet practical' };
}
