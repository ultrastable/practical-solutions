// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Where a solution fits. Countries differ in income, infrastructure and institutions, so a solution that suits one stage of
// development may be irrelevant or already universal at another. Levels follow the World Bank income groups; `fits` is each
// solution's own judgement from what it takes (see its "takes" and "who" fields), with a one-line reason shown to readers.
import { APPLIES } from './bca-models.js';
export const LEVELS = [
  { id: 'low', name: 'Low income', note: 'World Bank low-income economies' },
  { id: 'lower-middle', name: 'Lower-middle income', note: 'World Bank lower-middle-income economies' },
  { id: 'upper-middle', name: 'Upper-middle income', note: 'World Bank upper-middle-income economies' },
  { id: 'high', name: 'High income', note: 'World Bank high-income economies' },
];
const ALL = ['low', 'lower-middle', 'upper-middle', 'high'], LOW = ['low', 'lower-middle'], MID = ['lower-middle', 'upper-middle'], UP = ['upper-middle', 'high'];
// id -> [levels where the gap is largest and the solution most relevant, reason]
export const FITS = {
  kmc: [ALL, 'Needs only a trained nurse and skin-to-skin care; used in every setting.'],
  'ors-zinc': [LOW.concat('upper-middle'), 'Cheap sachets; the gap is where diarrhoea deaths remain, mostly low and lower-middle income.'],
  chlorine: [LOW.concat('upper-middle'), 'Matters where piped or treated water is not universal; high-income countries already treat municipal supplies.'],
  itn: [LOW.concat('upper-middle'), 'Relevant only where malaria is transmitted, concentrated in low and lower-middle income countries.'],
  tarl: [ALL, 'Grouping children by learning level needs no equipment; evidence comes from low and lower-middle income settings.'],
  immunisation: [ALL, 'Routine schedules apply everywhere; the coverage gap is largest in low income countries.'],
  vita: [LOW, 'Targets deficiency, which is concentrated in low and lower-middle income countries.'],
  cash: [ALL, 'Cash transfers work wherever a delivery channel exists; design differs by income level.'],
  hypertension: [ALL, 'Drug treatment and monitoring matter at every level; low-cost protocols suit health systems with few resources.'],
  'friendship-bench': [ALL, 'Lay-worker talk therapy fits places with few psychiatrists; also adapted in high-income countries.'],
  helmets: [MID.concat('low'), 'Motorcycle deaths concentrate where motorcycles are a main vehicle; most high-income countries already enforce helmets.'],
  'rural-electrification': [LOW, 'Relevant where rural grid access is far below universal.'],
  'mobile-money': [LOW.concat('upper-middle'), 'Fits where bank branches are scarce and mobile coverage is high.'],
  'women-leaders': [ALL, 'Seat reservation is a governance rule that any legislature or party can adopt.'],
  graduation: [LOW, 'Designed for extreme poverty, found mostly in low and lower-middle income countries.'],
  deworming: [LOW, 'Applies where worm infection is common; test first to target.'],
  'clean-cooking': [LOW, 'Relevant where households still cook with solid fuels.'],
  'emissions-market': [MID.concat('high'), 'Needs continuous monitors and a regulator able to enforce a cap; tested in a lower-middle income setting.'],
};
// The benefit-cost model's APPLIES table is the stricter source: a level it rules out is removed here, so the two never disagree.
export const fitFor = id => { const f = FITS[id], a = APPLIES[id] || {}; const levels = (f ? f[0] : ALL).filter(l => !(a[l] && a[l].applies === false)); return { levels, why: f ? f[1] : 'Not yet assessed by income level.' }; };
export const levelName = id => (LEVELS.find(l => l.id === id) || {}).name || '';
export const solutionsForLevel = (sols, level) => level ? sols.filter(s => (s.fit ? s.fit.levels : ALL).includes(level)) : sols;
