# Solution brief: Child survival beyond what income and setting predict

**Evidence case (a place, not the solution).** Solomon Islands (SLB) has an outcome of 20.000 where its context (NY.GDP.PCAP.PP.KD, SP.URB.TOTL.IN.ZS, SP.POP.TOTL) predicts 53.013; lower is better. That is 2.80 robust standard deviations above expectation, and it stays above 1 in 100% of bootstrap refits (n = 185).

**Matched peers** (nearest in context, not bright): COM, TLS, LSO, GNB, FSM.

**What differs from those peers** (standardized difference; association, not cause):

- SH.XPD.CHEX.GD.ZS: -1.42
- SH.STA.BASS.ZS: -0.96
- SH.IMM.IDPT: +0.75

**Independent check** (reviewer-loo-permutation): unit_only. unit is a real outlier; practice difference is not distinguishable from chance here Adjusted p = 1.000 for SH.XPD.CHEX.GD.ZS. Leave-one-out z = 2.19.

**Candidate practices (model-extracted from its general knowledge, unverified; @cf/meta/llama-3.3-70b-instruct-fp8-fast).**

- Solomon Islands Health Sector Improvement Program [medium]: Aims to improve health service delivery and management To check: World Bank project documents
- National Health Strategic Plan 2016-2020 [medium]: Outlines strategies for improving health outcomes To check: Government of Solomon Islands publications

Possible measurement artefacts:
- Small population size may lead to large variations in estimates
- Modelled estimates used due to limited data availability
- Conflict and instability may affect data collection and quality

**Prediction (scored automatically).** On the next data refresh, Solomon Islands's residual z stays at or above the problem's threshold, probability 1.00. The result is recorded whether it holds or not.

**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.

Dataset f073b40a; source worldbank.
