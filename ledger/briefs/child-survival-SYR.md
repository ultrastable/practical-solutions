# Child survival beyond what income and setting predict: Syrian Arab Republic

**Bright spot.** Syrian Arab Republic (SYR) has an outcome of 18.400 where its context (NY.GDP.PCAP.PP.KD, SP.URB.TOTL.IN.ZS, SP.POP.TOTL) predicts 45.738; lower is better. That is 2.32 robust standard deviations above expectation, and it stays above 1 in 100% of bootstrap refits (n = 185).

**Matched peers** (nearest in context, not bright): NPL, AGO, GHA, CMR, SEN.

**What differs from those peers** (standardized difference; association, not cause):

- SH.STA.BASS.ZS: +1.55
- SH.IMM.IDPT: -0.94
- SH.MED.PHYS.ZS: +0.70

**Independent check** (reviewer-loo-permutation): verified. practice differs from matched peers beyond chance Adjusted p = 0.096 for SH.STA.BASS.ZS. Leave-one-out z = 1.81.

**Candidate practices (model-extracted from its general knowledge, unverified; @cf/meta/llama-3.3-70b-instruct-fp8-fast).**

- National Health Strategy 2008-2015 [medium]: Improved healthcare infrastructure and services To check: World Health Organization reports or Syrian Ministry of Health publications
- Expanded Program on Immunization (EPI) [medium]: Increased vaccination coverage To check: World Health Organization EPI reports or Syrian Ministry of Health publications
- Primary Health Care (PHC) system [medium]: Decentralized healthcare services To check: World Health Organization PHC reports or Syrian Ministry of Health publications
- Healthcare system reform [low]: Improved healthcare management and financing To check: World Bank or Syrian Ministry of Health publications
- Disease surveillance and response system [low]: Enhanced disease detection and response To check: World Health Organization disease surveillance reports or Syrian Ministry of Health publications

Possible measurement artefacts:
- Conflict-related data disruptions
- Modelled estimates due to incomplete data
- Definition changes in health indicators

**Prediction (scored automatically).** On the next data refresh, Syrian Arab Republic's residual z stays at or above the problem's threshold, probability 1.00. The result is recorded whether it holds or not.

**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.

Dataset f073b40a; source worldbank.
