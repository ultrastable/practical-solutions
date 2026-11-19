# Solution brief: Child survival beyond what income and setting predict

**Evidence case (a place, not the solution).** Vanuatu (VUT) has an outcome of 17.100 where its context (NY.GDP.PCAP.PP.KD, SP.URB.TOTL.IN.ZS, SP.POP.TOTL) predicts 43.923; lower is better. That is 2.28 robust standard deviations above expectation, and it stays above 1 in 100% of bootstrap refits (n = 185).

**Matched peers** (nearest in context, not bright): FSM, COM, WSM, TLS, TON.

**What differs from those peers** (standardized difference; association, not cause):

- SH.XPD.CHEX.GD.ZS: -1.35
- SH.STA.BASS.ZS: -1.33
- SH.IMM.IDPT: -1.00

**Independent check** (reviewer-loo-permutation): unit_only. unit is a real outlier; practice difference is not distinguishable from chance here Adjusted p = 0.503 for SH.XPD.CHEX.GD.ZS. Leave-one-out z = 1.79.

**Candidate practices (model-extracted from its general knowledge, unverified; @cf/meta/llama-3.3-70b-instruct-fp8-fast).**

- Vanuatu Health Sector Strategy [medium]: Improved healthcare infrastructure and services To check: World Bank reports, Vanuatu Ministry of Health documents
- Pacific Island Health Care Project [medium]: Enhanced healthcare access and quality To check: World Bank project documents, Pacific Island Health Care Project reports
- National Health Promotion Strategy [low]: Promotion of healthy lifestyles and disease prevention To check: Vanuatu Ministry of Health documents, WHO reports
- Vanuatu Immunization Program [medium]: Vaccination campaigns and immunization services To check: WHO reports, Vanuatu Ministry of Health documents
- Health Care Reform Initiative [low]: Reforms to improve healthcare efficiency and effectiveness To check: World Bank reports, Vanuatu Ministry of Health documents

Possible measurement artefacts:
- Small population size may affect statistical reliability
- Modelled estimates used due to data limitations
- Potential definition changes in health indicators over time

**Prediction (scored automatically).** On the next data refresh, Vanuatu's residual z stays at or above the problem's threshold, probability 1.00. The result is recorded whether it holds or not.

**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.

Dataset f073b40a; source worldbank.
