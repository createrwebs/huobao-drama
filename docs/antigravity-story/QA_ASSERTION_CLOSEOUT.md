# Small QA harness review corrections; product unchanged

PO reviewed current qa_s1.py and confirmed three false-positive openings:
- Visual Main-Card Styles & Spacing records PASS without asserting nonzero padding or gaps. Assert numeric computed paddings >0 for brief/final/shot, and appropriate gap >0 for story-content/episode-section, then record PASS.
- Content-type assertion ends `or http_status in (200,206)`, which always succeeds because status already asserted. Remove that OR; require video/ or application/octet-stream, followed by actual decode metadata.
- Positive duration check allows Infinity. Require math.isfinite duration and >0 (or native Number.isFinite before returning metadata); positive videoWidth/Height too.

Only QA files allowed. Fix these small checks and rerun exact Python browser command once, no repeat unit/build since product unchanged. Preserve prior runs. Update QA_S1 current run/counts evidence and actual NOT RUN SPA race. Do not claim fixture files render real media. Current real existing videos must satisfy strict checks + currentTime advances. Five-minute bound; final response required.
