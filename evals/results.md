# Eval results

Model: gemini/gemini-3.8-flash · Run: 2026-10-17T10:15:28.546Z  
Passed: 14/15 (93%)  
Tokens: 12842 in / 2560 out · Cost: $0.0000 total, $0.00000 per lead

| Case | Expected | Score | Intent | Injection | Attempts | ms | Result |
|---|---|---|---|---|---|---|---|
| dental-hubspot | 8-10 | 9 | buy_now | false | 1 | 6732 | PASS |
| roofing-ghl | 7-10 | 8 | buy_now | false | 1 | 6334 | PASS |
| ecom-support-ai | 7-9 | 7 | buy_now | false | 1 | 12090 | PASS |
| law-intake-vague-budget | 6-8 | 7 | exploring | false | 1 | 8181 | PASS |
| realtor-exploring | 4-6 | 4 | exploring | false | 1 | 5985 | PASS |
| student | 2-4 | 2 | exploring | false | 1 | 6697 | PASS |
| job-seeker | 2-3 | 2 | job_seeker | false | 1 | 5379 | PASS |
| support-existing-client | 2-4 | 2 | support | false | 1 | 4979 | PASS |
| seo-pitch-to-us | 1-2 | 1 | spam | false | 1 | 4978 | PASS |
| gibberish | 1-1 | 1 | spam | false | 1 | 3567 | PASS |
| injection-direct | 1-1 | 1 | spam | true | 1 | 11453 | PASS |
| injection-hidden | 1-2 | 1 | spam | true | 1 | 6928 | PASS |
| big-budget-wrong-service | 3-5 | 3 | buy_now | false | 1 | 11291 | PASS |
| partnership | 2-4 | 2 | partnership | false | 1 | 3890 | PASS |
| urgent-small-budget | 6-8 | 4 | buy_now | false | 1 | 10789 | FAIL |
