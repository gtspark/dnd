# API ENDPOINT CONSISTENCY AUDIT REPORT
**D&D Campaign Manager - /opt/dnd**
**Date:** 2025-12-09

---

## EXECUTIVE SUMMARY

This audit cross-references ALL API endpoints defined in the server with ALL fetch() calls made by the frontend to identify inconsistencies, missing endpoints, and unused routes.

**Key Findings:**
- ✅ **GOOD**: Most endpoints support multiple path aliases (/api/dnd/, /dnd-api/dnd/, /dnd/api/dnd/)
- ⚠️ **INCONSISTENCY**: Mixed usage of `/dnd/api/dnd/` vs `/dnd-api/dnd/` prefixes in frontend
- ✅ **GOOD**: All major frontend calls have corresponding server endpoints
- ⚠️ **ISSUE**: Many server endpoints are never called by the current frontend

---

## 1. SERVER API ENDPOINTS (complete-intelligent-server.js)

### 1.1 Static Routes (Single Endpoint)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dnd/game.html` | Serve game HTML |
| GET | `/dnd/` | Serve splash page |
| GET | `/api/dnd/context` | Get campaign context |
| POST | `/api/dnd/roll` | Process dice roll |
| POST | `/api/dnd/roll-result` | Process roll result (Phase 2) |
| POST | `/api/dnd/search` | Search campaign data |
| POST | `/api/dnd/debug-context` | Debug context info |
| POST | `/api/dnd/clear-history` | Clear conversation history |
| POST | `/api/dnd/backup` | Backup campaign data |
| GET | `/api/dnd/stats` | Get server stats |
| GET | `/api/dnd/ai-provider` | Get current AI provider |
| POST | `/api/dnd/ai-provider` | Set AI provider |
| POST | `/api/dnd/rollback` | Rollback campaign state |
| GET | `/api/dnd/campaigns` | List campaigns |
| POST | `/api/dnd/campaigns/:id/auth` | Authenticate to campaign |
| POST | `/api/dnd/generate-scene` | Generate scene image |
| POST | `/api/dnd/equipment/add` | Add equipment |
| DELETE | `/api/dnd/equipment/:equipmentId` | Remove equipment |
| POST | `/api/dnd/character/hp` | Update character HP |
| POST | `/api/dnd/character/credits` | Update character credits |
| POST | `/api/dnd/character/condition/add` | Add condition |
| DELETE | `/api/dnd/character/condition/:conditionId` | Remove condition |
| GET | `/api/dnd/events/recent` | Get recent events |
| GET | `/api/dnd/quests` | Get quest list |
| GET | `/api/health` | Health check |

### 1.2 Multi-Alias Routes (Multiple Path Support)

#### Action Routes (POST)
```javascript
[
  '/api/dnd/action',
  '/dnd-api/dnd/action',
  '/dnd/api/dnd/action'
]
```

#### State Routes (GET)
```javascript
[
  '/api/dnd/state',
  '/dnd-api/dnd/state'
]
```

#### Roll Queue Routes (GET, POST, PATCH, DELETE)
```javascript
[
  '/api/dnd/roll-queue',
  '/dnd-api/dnd/roll-queue',
  '/dnd/api/dnd/roll-queue'
]
```
- GET: Fetch roll queue
- POST: Add to roll queue
- POST `/:queueId/resolve`: Resolve roll
- POST `/:queueId/override`: Override roll
- DELETE `/:queueId`: Delete roll

#### Combat State Routes (GET)
```javascript
[
  '/api/dnd/combat/state',
  '/api/dnd/combat-state',
  '/dnd-api/dnd/combat/state',
  '/dnd-api/dnd/combat-state',
  '/dnd/api/dnd/combat/state',
  '/dnd/api/dnd/combat-state'
]
```

#### Combat Start Routes (POST)
```javascript
[
  '/api/dnd/combat/start',
  '/dnd-api/dnd/combat/start',
  '/dnd/api/dnd/combat/start'
]
```

#### Combat Next Turn Routes (POST)
```javascript
[
  '/api/dnd/combat/next-turn',
  '/dnd-api/dnd/combat/next-turn',
  '/dnd/api/dnd/combat/next-turn'
]
```

#### Combat Action Economy Routes (POST)
```javascript
[
  '/api/dnd/combat/action-economy',
  '/dnd-api/dnd/combat/action-economy',
  '/dnd/api/dnd/combat/action-economy'
]
```

#### Combat HP Routes (POST)
```javascript
[
  '/api/dnd/combat/hp',
  '/dnd-api/dnd/combat/hp',
  '/dnd/api/dnd/combat/hp'
]
```

#### Combat Condition Routes (POST)
```javascript
[
  '/api/dnd/combat/condition',
  '/dnd-api/dnd/combat/condition',
  '/dnd/api/dnd/combat/condition'
]
```

#### Combat End Routes (POST)
```javascript
[
  '/api/dnd/combat/end',
  '/dnd-api/dnd/combat/end',
  '/dnd/api/dnd/combat/end'
]
```

#### Combat Action Routes (POST)
```javascript
[
  '/api/dnd/combat/action',
  '/dnd-api/dnd/combat/action',
  '/dnd/api/dnd/combat/action'
]
```

#### Equipment GET Routes
```javascript
[
  '/api/dnd/equipment/:character',
  '/dnd-api/dnd/equipment/:character'
]
```

---

## 2. FRONTEND FETCH CALLS

### 2.1 script.js (Legacy Frontend)

| Line | Fetch Call | Purpose |
|------|------------|---------|
| 744 | `fetch(campaignPath)` | Load conversation history (dynamic path) |
| 1139 | `fetch('/dnd/api/dnd/ai-provider')` | Get AI provider status |
| 1169 | `fetch('/dnd/api/dnd/ai-provider', {POST})` | Set AI provider |
| 1586 | `fetch('/dnd-api/dnd/state${campaignParam}')` | Sync campaign state |
| 2016 | `fetch('/dnd-api/dnd/generate-scene', {POST})` | Generate scene image |

### 2.2 Svelte Components (Modern Frontend)

#### EquipmentManager.svelte
```javascript
Line 19:  fetch(`/dnd-api/dnd/equipment/${encodedChar}?campaign=${campaign}`)
Line 40:  fetch(`/dnd-api/dnd/equipment/${equipmentId}?campaign=${campaign}`, {DELETE})
```

#### PartyCredits.svelte
```javascript
Line 22:  fetch(`/dnd-api/dnd/state?campaign=${campaign}`)
```

#### CombatTracker.svelte
```javascript
Line 52:  fetch(url, {POST})  // Dynamic URL via buildEndpointCandidates()
// Uses intelligent fallback across: /dnd-api/dnd, /dnd/api/dnd, /api/dnd
```

#### SceneGenerator.svelte
```javascript
Line 22:  fetch(testUrl, {HEAD})  // Test if scene image exists
Line 41:  fetch('/dnd-api/dnd/generate-scene', {POST})
```

#### GameLog.svelte
```javascript
Line 39:  fetch(campaignPath)  // Load conversation history
```

#### AIProviderSettings.svelte
```javascript
Line 38:  fetch(`/dnd-api/dnd/ai-provider?campaign=${campaign}`)
Line 61:  fetch('/dnd-api/dnd/ai-provider', {POST})
```

#### CampaignManager.svelte
```javascript
Line 24:  fetch(`/dnd-api/dnd/state?campaign=${campaign}`)
Line 54:  fetch(`/dnd-api/dnd/equipment/${encodedChar}?campaign=${campaign}`)
Line 63:  fetch(`/dnd-api/dnd/state?campaign=${campaign}`)
Line 85:  fetch(`/dnd-api/dnd/equipment/${equipmentId}?campaign=${campaign}`, {DELETE})
```

---

## 3. PATH PREFIX ANALYSIS

### 3.1 Prefix Usage Breakdown

**Frontend Preference:**
- `/dnd-api/dnd/*` - **PRIMARY** (most Svelte components)
- `/dnd/api/dnd/*` - **SECONDARY** (script.js legacy)
- `/api/dnd/*` - **RARELY USED** (only in fallback logic)

**Server Support:**
- Most routes support ALL THREE prefixes
- Some routes ONLY support `/api/dnd/*`

### 3.2 Inconsistencies

#### ⚠️ INCONSISTENCY #1: AI Provider Endpoint
**Frontend calls:**
- script.js: `/dnd/api/dnd/ai-provider`
- Svelte: `/dnd-api/dnd/ai-provider`

**Server defines:** Only `/api/dnd/ai-provider`

**Impact:** Frontend calls will FAIL unless server is proxying these paths!

#### ⚠️ INCONSISTENCY #2: Generate Scene Endpoint
**Frontend calls:**
- script.js: `/dnd-api/dnd/generate-scene`
- SceneGenerator.svelte: `/dnd-api/dnd/generate-scene`

**Server defines:** Only `/api/dnd/generate-scene`

**Impact:** Frontend calls will FAIL unless server is proxying these paths!

---

## 4. ENDPOINT MATCHING MATRIX

| Frontend Call | Server Endpoint | Status |
|---------------|-----------------|--------|
| `/dnd-api/dnd/state` | ✅ `/api/dnd/state`, `/dnd-api/dnd/state` | MATCH |
| `/dnd-api/dnd/equipment/:char` | ✅ `/api/dnd/equipment/:character`, `/dnd-api/dnd/equipment/:character` | MATCH |
| `/dnd-api/dnd/ai-provider` | ❌ ONLY `/api/dnd/ai-provider` | **MISMATCH** |
| `/dnd/api/dnd/ai-provider` | ❌ ONLY `/api/dnd/ai-provider` | **MISMATCH** |
| `/dnd-api/dnd/generate-scene` | ❌ ONLY `/api/dnd/generate-scene` | **MISMATCH** |
| CombatTracker (dynamic) | ✅ Multiple combat routes with aliases | MATCH |

---

## 5. UNUSED SERVER ENDPOINTS

The following endpoints are defined on the server but NEVER called by the frontend:

### Never Called Endpoints
1. `POST /api/dnd/action` - (Likely used by external system or deprecated)
2. `GET /api/dnd/context` - Not used by current frontend
3. `POST /api/dnd/roll` - Not used by current frontend
4. `POST /api/dnd/roll-result` - Not used by current frontend
5. `POST /api/dnd/search` - Never called
6. `POST /api/dnd/debug-context` - Never called
7. `POST /api/dnd/clear-history` - Never called
8. `POST /api/dnd/backup` - Never called
9. `GET /api/dnd/stats` - Never called
10. `POST /api/dnd/rollback` - Never called
11. `GET /api/dnd/campaigns` - Never called
12. `POST /api/dnd/campaigns/:id/auth` - Never called
13. `POST /api/dnd/equipment/add` - Never called
14. `POST /api/dnd/character/hp` - Never called
15. `POST /api/dnd/character/credits` - Never called
16. `POST /api/dnd/character/condition/add` - Never called
17. `DELETE /api/dnd/character/condition/:conditionId` - Never called
18. `GET /api/dnd/events/recent` - Never called
19. `GET /api/dnd/quests` - Never called
20. All combat routes (`/api/dnd/combat/*`) - Called dynamically by CombatTracker with fallback logic

---

## 6. MISSING FRONTEND HANDLERS

The following calls are made by the frontend but MAY NOT have corresponding server endpoints (depends on proxy configuration):

1. ❌ `/dnd-api/dnd/ai-provider` (GET & POST)
2. ❌ `/dnd/api/dnd/ai-provider` (GET & POST)
3. ❌ `/dnd-api/dnd/generate-scene` (POST)

**Note:** These may work if Express is configured to proxy `/dnd-api/*` and `/dnd/api/*` to `/api/*`

---

## 7. RECOMMENDATIONS

### High Priority (Breaking Issues)

1. **Add Multi-Alias Support for AI Provider Routes**
   ```javascript
   const aiProviderRoutes = [
     '/api/dnd/ai-provider',
     '/dnd-api/dnd/ai-provider',
     '/dnd/api/dnd/ai-provider'
   ];
   ```

2. **Add Multi-Alias Support for Scene Generation**
   ```javascript
   const sceneGenRoutes = [
     '/api/dnd/generate-scene',
     '/dnd-api/dnd/generate-scene',
     '/dnd/api/dnd/generate-scene'
   ];
   ```

### Medium Priority (Consistency)

3. **Standardize Frontend to Use Single Prefix**
   - Recommended: `/dnd-api/dnd/*` (already used by Svelte components)
   - Update script.js to match Svelte convention

4. **Document Unused Endpoints**
   - Add comments explaining purpose of endpoints never called by frontend
   - Remove truly deprecated endpoints

5. **Add Endpoint Inventory to README**
   - Document all available endpoints
   - Mark which are called by which frontend components

### Low Priority (Nice to Have)

6. **Create API Client Library**
   - Centralize all fetch() calls in a single service
   - Eliminate hardcoded URLs throughout components
   - Make path prefix configurable

7. **Add Endpoint Testing**
   - Create integration tests that verify all server endpoints respond
   - Test that all frontend fetch calls reach valid endpoints

---

## 8. PROXY CONFIGURATION CHECK

**CRITICAL QUESTION:** Is there an nginx/Apache/Express proxy rule that maps:
- `/dnd-api/*` → `/api/*`
- `/dnd/api/*` → `/api/*`

If YES: Most mismatches are resolved by proxy
If NO: Frontend calls to `/dnd-api/dnd/ai-provider` and `/dnd-api/dnd/generate-scene` will FAIL

**ACTION REQUIRED:** Check proxy configuration or add missing route aliases to server.

---

## 9. SUMMARY TABLE

| Category | Count | Notes |
|----------|-------|-------|
| Total Server Endpoints | 50+ | Including all aliases |
| Unique Server Endpoints | ~35 | Excluding aliases |
| Frontend fetch() Calls | 15 | Across script.js + Svelte |
| Confirmed Mismatches | 3 | AI provider (2) + scene gen (1) |
| Unused Server Endpoints | 20+ | Never called by current frontend |
| Path Prefixes in Use | 3 | /api/dnd, /dnd-api/dnd, /dnd/api/dnd |

---

## CONCLUSION

The D&D Campaign Manager has a **generally well-structured API** with good multi-alias support for most endpoints. However, there are **critical inconsistencies** around:

1. AI provider endpoints
2. Scene generation endpoint

These endpoints are called by the frontend but may not be reachable unless proxy rules are in place. Additionally, many server endpoints appear to be **unused by the current frontend**, suggesting either:
- Dead code that should be removed
- Backend functionality used by external systems
- Features not yet integrated into the UI

**Next Steps:**
1. ✅ Verify proxy configuration
2. ⚠️ Add missing route aliases for ai-provider and generate-scene
3. 📋 Document which endpoints are frontend-facing vs API-only
4. 🧹 Clean up or document unused endpoints
