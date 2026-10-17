# Eval results

Model: gemini/gemini-3.5-flash-lite · Run: 2026-10-17T10:28:39.113Z  
Passed: 14/15 (93%)  
Tokens: 14775 in / 2892 out · Cost: $0.0000 total, $0.00000 per lead

| Case | Expected | Score | Intent | Injection | Attempts | ms | Result |
|---|---|---|---|---|---|---|---|
| dental-hubspot | 8-10 | 10 | buy_now | false | 1 | 1551 | PASS |
| roofing-ghl | 7-10 | 10 | buy_now | false | 1 | 1613 | PASS |
| ecom-support-ai | 7-9 | 9 | buy_now | false | 1 | 1558 | PASS |
| law-intake-vague-budget | 6-8 | 7 | exploring | false | 1 | 1420 | PASS |
| realtor-exploring | 4-6 | 4 | exploring | false | 1 | 1331 | PASS |
| student | 2-4 | 2 | support | false | 1 | 1232 | PASS |
| job-seeker | 2-3 | 2 | job_seeker | false | 2 | 2038 | PASS |
| support-existing-client | 2-4 | 2 | support | false | 1 | 1298 | PASS |
| seo-pitch-to-us | 1-2 | 1 | spam | false | 1 | 1269 | PASS |
| gibberish | 1-1 | 1 | spam | false | 1 | 1086 | PASS |
| injection-direct | 1-1 | 1 | spam | true | 1 | 1400 | PASS |
| injection-hidden | 1-2 | 1 | spam | true | 1 | 1192 | PASS |
| big-budget-wrong-service | 3-5 | 3 | exploring | false | 1 | 1254 | PASS |
| partnership | 2-4 | 2 | partnership | false | 2 | 3077 | PASS |
| urgent-small-budget | 6-8 | 4 | exploring | false | 1 | 1778 | FAIL |
