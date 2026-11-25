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
  'clean-cooking': { cost: 'high', cost_note: 'Stove plus continuing fuel supply; a cheaper delivery model may be possible through community-based initiatives (Respiratory risks from household air pollution in low and middle income countries, 2014)', adoption: 'piloted', channel: 'clean-cooking programmes', actors: 'energy ministries', limits: 'No evidence of adoption beyond pilots or a low-cost delivery variant' },
  'pph-bundle': { cost: 'low', cost_note: 'Drapes, a bundle trolley and training; the drugs are already stocked', adoption: 'piloted', channel: 'hospital maternity wards', actors: 'ministries of health, maternity ward managers' },
  'tb-community-screening': { cost: 'high', cost_note: 'Many rapid molecular tests per case found, plus door-to-door teams', adoption: 'trial-only', channel: 'national tuberculosis programmes', actors: 'national tuberculosis programmes', limits: 'No evidence of adoption beyond trials or a low-cost delivery variant' },
  cytisine: { cost: 'low', cost_note: 'A 25-day generic course', adoption: 'piloted', channel: 'quitlines and primary-care stop-smoking services', actors: 'health ministries, medicines regulators' },
  'latrine-subsidy': { cost: 'medium', cost_note: 'A voucher worth part of a latrine for each poor household, plus mobilisation visits', adoption: 'piloted', channel: 'rural sanitation programmes and community-led total sanitation campaigns', actors: 'local governments, sanitation departments', limits: 'No evidence of a cheaper delivery model, programme-scale adoption, or a channel beyond rural sanitation programmes and community-led total sanitation campaigns' },
  'cash-birth-certificate': { cost: 'low', cost_note: 'A rule added to a transfer that is already paid; registration itself must be free', adoption: 'piloted', channel: 'child grants and other cash-transfer programmes', actors: 'social-protection ministries, civil registration authorities' },
  'smartphones-for-women': { cost: 'high', cost_note: 'A handset and data for every household', adoption: 'trial-only', channel: 'universal-service funds and mobile operators', actors: 'telecom regulators, mobile operators', limits: 'No evidence of adoption beyond trials or a low-cost delivery variant; most handsets were gone within a year in trials' },
  'emissions-market': { cost: 'high', cost_note: 'Monitors and a market platform', adoption: 'trial-only', channel: null, actors: 'state pollution control boards', limits: 'No evidence of adoption beyond trials or a low-cost delivery variant; no existing delivery channel' },
};
export const COST = { low: 3, medium: 2, high: 1 }, ADOPT = { scaled: 3, piloted: 2, 'trial-only': 1 }, CHANNEL_POINTS = 2;
export const MIN_PRACTICAL = 5, READY = 7;
export const SCORED_FACTS = ['cost', 'adoption', 'channel'];
const list = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
export const RULE = `Score ${Math.min(...Object.values(COST)) + Math.min(...Object.values(ADOPT))} to ${Math.max(...Object.values(COST)) + Math.max(...Object.values(ADOPT)) + CHANNEL_POINTS} = cost to start (${list(COST)}) + real-world adoption (${list(ADOPT)}) + an existing delivery channel (${CHANNEL_POINTS}). ${READY} or more is ready to implement; ${MIN_PRACTICAL} or ${READY - 1} is implementable with effort; below ${MIN_PRACTICAL} is held back as not yet practical.`;

// Score 2-8: cost (1-3) + adoption (1-3) + an existing delivery channel (2 or 0). Below MIN_PRACTICAL a solution is held back from the main list.
export function implementability(id) {
  const f = IMPL[id];
  if (!f) return null;
  const score = COST[f.cost] + ADOPT[f.adoption] + (f.channel ? CHANNEL_POINTS : 0);
  return { ...f, score, practical: score >= MIN_PRACTICAL, band: score >= READY ? 'ready to implement' : score >= MIN_PRACTICAL ? 'implementable with effort' : 'not yet practical' };
}
