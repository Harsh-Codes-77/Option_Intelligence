# System Diagnostic Audit - Options Intelligence Platform

## 🔴 High Severity (System Blockers)

### 1. Redis Reconnect Storm & Crash Loop
**Location:** `backend/src/config/redis.ts`
**Issue:** `enableOfflineQueue: true` combined with returning `null` from `retryStrategy` after max retries causes an infinite crash loop / reconnect storm, and `Stream isn't writeable and enableOfflineQueue options is false` errors when pending operations are flushed.
**Fix:** Set `enableOfflineQueue: false` to immediately reject operations during downtime and prevent memory leaks. Introduce graceful fallback in data stores if Redis is unavailable.

### 2. NSE Fetch 404s for FINNIFTY and MIDCPNIFTY
**Locations:** `backend/src/fetchers/futures.ts`, `backend/src/fetchers/optionChain.ts`
**Issue:** 
- `futures.ts` falls back to `getEquityStockIndices(symbol)` if `getIndexOptionChain` fails. `getEquityStockIndices` calls `/api/quote-derivative` internally, which returns 404 for indices like FINNIFTY.
- `stock-nse-india` or direct fetches attempt to use outdated `/api/option-chain-indices?symbol=MIDCPNIFTY` endpoint, which returns 404.
**Fix:** Update `futures.ts` to correctly handle indices vs equities. Use `nseFetcher.getAllIndices()` or `fetchIndexData` to approximate spot prices for indices. Ensure `optionChain.ts` correctly defers to `nseFetcher.getIndexOptionChain` which correctly uses `/api/option-chain-contract-info` internally for MIDCPNIFTY.

### 3. Extreme Cycle Latency (130+ seconds)
**Location:** `backend/src/scheduler/cron.ts`
**Issue:** Sequential `await` chains and excessive `rateLimitDelay` (500ms per fetch) cause the cycle to run extremely slowly. `cron.ts` loops over all symbols sequentially and waits for `safeFetch` and Kotak fallbacks.
**Fix:** Run fetchers for symbols concurrently using `Promise.allSettled`. Implement strict timeout wrappers for external API calls to prevent any single dead endpoint from stalling the cycle.

## 🟠 Medium Severity (Data Integrity & Observability)

### 4. Silent Failure Swallowing
**Locations:** `backend/src/config/redis.ts`, `backend/src/fetchers/*`
**Issue:** Catch blocks silently ignore errors (e.g., `setCache`, `pushToList`) with comments like `// Silently ignore — Redis unavailability is already logged at connection level`.
**Fix:** Replace empty catch blocks with structured logging (e.g., `console.warn('[Redis/Cache] Failed to set key:', key)`).

### 5. Inconsistent Missing Data Fallbacks
**Location:** `backend/src/scheduler/cron.ts`
**Issue:** `cron.ts` skips processing for symbols if option chain data is missing, but fallback/default initialization is not robust or consistent for all fetchers (e.g., if FII/DII data fails).
**Fix:** Standardize the fallback mechanisms across all API fetches. If data is missing, default it locally or retain the last known good state rather than skipping vital engine runs.

## 🟡 Low Severity (Code Quality)

### 6. Missing Type Validations (any-types)
**Locations:** `backend/src/engines/*`
**Issue:** Engines accept `any`-typed inputs and blindly access properties without validation, which can crash the entire engine pipeline if upstream API schemas change.
**Fix:** Apply Zod schemas or strict TypeScript interfaces to validate inputs before computing scoring data.

### 7. Unused Files / Duplicates
**Locations:** `backend/src/test-*.ts`
**Issue:** Stray test files clutter the source directory.
**Fix:** Move or delete `backend/src/test-*.ts` and organize tests into `backend/src/tests/`.
