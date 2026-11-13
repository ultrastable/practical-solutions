# Child survival beyond what income and setting predict: Vanuatu

**Bright spot.** Vanuatu (VUT) has an outcome of 17.100 where its context (NY.GDP.PCAP.PP.KD, SP.URB.TOTL.IN.ZS, SP.POP.TOTL) predicts 43.923; lower is better. That is 2.28 robust standard deviations above expectation, and it stays above 1 in 100% of bootstrap refits (n = 185).

**Matched peers** (nearest in context, not bright): FSM, COM, WSM, TLS, TON.

**What differs from those peers** (standardized difference; association, not cause):

- SH.XPD.CHEX.GD.ZS: -1.35
- SH.STA.BASS.ZS: -1.33
- SH.IMM.IDPT: -1.00

**Independent check** (reviewer-loo-permutation): unit_only. unit is a real outlier; practice difference is not distinguishable from chance here Adjusted p = 0.503 for SH.XPD.CHEX.GD.ZS. Leave-one-out z = 1.79.

**Prediction (scored automatically).** On the next data refresh, Vanuatu's residual z stays at or above the problem's threshold, probability 1.00. The result is recorded whether it holds or not.

**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.

Dataset f073b40a; source worldbank.
