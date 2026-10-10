# Tora M1 prerequisite: keep credentials out of request logs

Human approved Tora key integration and autonomous Dev/QA. Source inspection confirms backend/src/middleware/logger.ts clones and prints every POST/PUT/PATCH request body (first500 characters), including API-key save requests. A Tora connection key must never enter these logs. No existing secrets should be read to demonstrate this.

Smallest correction: remove body reading/logging entirely from requestLogger. Retain method/path/status/latency diagnostics and error handling. Do not add dependency, recursive scrubber, option, or alter provider/generation behavior. Do not touch errorHandler unless a test reveals the requested middleware regression.

Allowed product edit: backend/src/middleware/logger.ts. New test backend/tests/request-logger.test.ts. Delivery docs/antigravity-story/DELIVERY_TORA_LOGGING.md. No other edits, database, provider, network calls, deploy/commit, credential reads or permission edits.

Write a meaningful Node test using real Hono app/middleware and synthetic credential sentinels (not real sk keys), capturing console output: POST/PUT/PATCH bodies contain apiKey, nested credential plus benign prompt; no body/sentinel appears; handler still receives complete JSON body and response/status intact; GET and failing status still have method/path/status/time diagnostics. Prove RED before removal then GREEN. Preserve original console with finally to avoid contaminating tests.

Exact permitted command:
rtk node --import /Users/noppanan/huobao-drama/backend/node_modules/tsx/dist/loader.mjs --test /Users/noppanan/huobao-drama/backend/tests/request-logger.test.ts

Use ECC TDD then independent QA; Dev cannot self-accept. Three-minute bound. Record command/count/exit/red-green truthfully; final response with changed files and limitations. This prerequisite does not claim Tora M1 or billing implemented.
