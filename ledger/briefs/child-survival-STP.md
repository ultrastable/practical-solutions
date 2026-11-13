# Child survival beyond what income and setting predict: Sao Tome and Principe

**Bright spot.** Sao Tome and Principe (STP) has an outcome of 13.600 where its context (NY.GDP.PCAP.PP.KD, SP.URB.TOTL.IN.ZS, SP.POP.TOTL) predicts 37.907; lower is better. That is 2.07 robust standard deviations above expectation, and it stays above 1 in 100% of bootstrap refits (n = 185).

**Matched peers** (nearest in context, not bright): KIR, CPV, DJI, MHL, FJI.

**What differs from those peers** (standardized difference; association, not cause):

- SH.STA.BASS.ZS: -0.95
- SH.XPD.CHEX.GD.ZS: -0.43

**Independent check** (reviewer-loo-permutation): unit_only. unit is a real outlier; practice difference is not distinguishable from chance here Adjusted p = 0.519 for SH.STA.BASS.ZS. Leave-one-out z = 1.62.

**Candidate practices (model-extracted from its general knowledge, unverified; @cf/meta/llama-3.3-70b-instruct-fp8-fast).**

- National Health Strategy [medium]: Improved healthcare infrastructure and services To check: World Bank reports, WHO country profiles
- Malaria Control Program [medium]: Targeted interventions to reduce malaria incidence To check: WHO malaria reports, Global Fund grants
- Health Promotion Program [low]: Community-based health education and awareness campaigns To check: UNICEF reports, national health ministry websites
- Essential Medicines Program [medium]: Increased access to essential medicines and healthcare services To check: WHO Essential Medicines List, national pharmaceutical policies
- Community Health Worker Program [low]: Trained community health workers providing basic healthcare services To check: WHO community health worker reports, national health worker policies

Possible measurement artefacts:
- Small population size may affect statistical robustness
- Modelled estimates used due to data limitations
- Potential definition changes in health outcome indicators

**Prediction (scored automatically).** On the next data refresh, Sao Tome and Principe's residual z stays at or above the problem's threshold, probability 1.00. The result is recorded whether it holds or not.

**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.

Dataset f073b40a; source worldbank.
