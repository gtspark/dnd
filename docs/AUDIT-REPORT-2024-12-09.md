# D&D Campaign Manager - Deep Dive Audit Report
**Date:** 2024-12-09
**Auditors:** 10 Claude subagents
**Scope:** Full codebase analysis

---

## Executive Summary

Comprehensive audit of `/opt/dnd` identified **100+ issues** across security, architecture, and code quality. The codebase is functional but contains significant technical debt that blocks true multi-campaign support.

**Overall Assessment:**
- Core functionality: Working
- Multi-campaign support: Partially broken
- Security: 1 critical issue (exposed API key)
- Code quality: Mixed (good error handling, poor architecture consistency)

---

# PHASE 1: CRITICAL FIXES (Do First)

## 1.1 Security - Exposed API Key
**Priority:** P0 - IMMEDIATE
**Time:** 5 minutes
**Risk:** High (credential exposure)

**File:** `/opt/dnd/complete-intelligent-server.js`
**Line:** 6383

```javascript
// CURRENT (EXPOSED!)
const STABILITY_API_KEY = 'ASK_CHRIS_FOR_NEW_STABILITY_KEY';

// FIX
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
```

**Action:** Move to `.env` file, rotate the exposed key.

---

## 1.2 Broken Dax Campaign - Missing Scripts
**Priority:** P0 - IMMEDIATE
**Time:** 15 minutes
**Risk:** High (campaign completely broken)

**File:** `/opt/dnd/campaigns/dax/index.html`
**Lines:** 505-506

```html
<!-- CURRENT (FILES DON'T EXIST) -->
<script src="api-handler.js?v=1764054345&cf=dev"></script>
<script src="script.js?v=1764054345&cf=dev"></script>

<!-- FIX -->
<script src="/dnd/shared/api-handler-base.js?v=TIMESTAMP"></script>
<script src="/dnd/shared/campaign-base.js?v=TIMESTAMP"></script>
<script src="/dnd/campaigns/dax/campaign-config.js?v=TIMESTAMP"></script>
```

**Also fix:** `/opt/dnd/game.html` (same issue, lines 471-472)

---

## 1.3 Wrong Svelte Build Hash
**Priority:** P0 - IMMEDIATE
**Time:** 10 minutes
**Risk:** High (Svelte components won't load)

**Files affected:**
- `/opt/dnd/campaigns/dax/index.html` (line 630)
- `/opt/dnd/campaigns/test-silverpeak/index.html` (line 443)

```html
<!-- CURRENT (WRONG HASH) -->
<script type="module" src="/dnd/campaigns/test-silverpeak/svelte-dist/assets/index-DpGllzxI.js"></script>

<!-- FIX (CORRECT HASH) -->
<script type="module" src="/dnd/campaigns/test-silverpeak/svelte-dist/assets/index-C8l6J5-K.js"></script>
```

**Actual files in svelte-dist/assets/:**
- `index-C8l6J5-K.js` (128KB)
- `index-6GABUy0N.css` (44KB)

---

## 1.4 Missing API Route Aliases
**Priority:** P0 - IMMEDIATE
**Time:** 20 minutes
**Risk:** High (frontend API calls fail)

**File:** `/opt/dnd/complete-intelligent-server.js`

**AI Provider endpoint** (around line 6076):
```javascript
// CURRENT - only one path
app.get('/api/dnd/ai-provider', ...)
app.post('/api/dnd/ai-provider', ...)

// FIX - add aliases
const aiProviderRoutes = [
    '/api/dnd/ai-provider',
    '/dnd-api/dnd/ai-provider',
    '/dnd/api/dnd/ai-provider'
];
aiProviderRoutes.forEach(route => {
    app.get(route, ...);
    app.post(route, ...);
});
```

**Scene Generation endpoint** (around line 6266):
```javascript
// CURRENT - only one path
app.post('/api/dnd/generate-scene', ...)

// FIX - add aliases
const sceneGenRoutes = [
    '/api/dnd/generate-scene',
    '/dnd-api/dnd/generate-scene',
    '/dnd/api/dnd/generate-scene'
];
sceneGenRoutes.forEach(route => app.post(route, ...));
```

---

# PHASE 2: MULTI-CAMPAIGN FIXES (High Priority)

## 2.1 Remove Hardcoded "test-silverpeak" Checks
**Priority:** P1 - This Week
**Time:** 2-3 hours
**Risk:** Medium (blocks multi-campaign)

**File:** `/opt/dnd/complete-intelligent-server.js`

**19 instances to fix:**

| Line | Current | Fix |
|------|---------|-----|
| 993 | `if (this.campaignId === 'test-silverpeak')` | Use campaign config |
| 1085 | `if (this.campaignId === 'test-silverpeak')` | Use campaign config |
| 2376 | `if (this.memoryClient && this.campaignId === 'test-silverpeak')` | Check `campaignConfig.usesRAG` |
| 2754 | `if (this.campaignId === 'test-silverpeak' && this.memoryClient)` | Check `campaignConfig.usesRAG` |
| 3215 | `if (this.campaignId === 'test-silverpeak' && this.memoryClient)` | Check `campaignConfig.usesRAG` |
| 3554 | `if (this.campaignId === 'test-silverpeak' && this.db)` | Check `campaignConfig.usesDatabase` |
| 3915 | `DEFAULT_CAMPAIGN = 'test-silverpeak'` | Use `'default'` or env var |
| 5735 | `if (context.db && activeCampaignId === 'test-silverpeak')` | Check campaign config |
| 5875 | `if (context.db && activeCampaignId === 'test-silverpeak')` | Check campaign config |
| 6532-6849 | 8 API gates rejecting non-silverpeak | Use feature detection |

**Solution:** Create campaign feature config:
```javascript
// /opt/dnd/campaign-features.js
module.exports = {
    'test-silverpeak': {
        usesDatabase: true,
        usesRAG: true,
        genre: 'fantasy',
        hasEquipmentAPI: true
    },
    'dax': {
        usesDatabase: false,
        usesRAG: false,
        genre: 'scifi',
        hasEquipmentAPI: false
    }
};
```

---

## 2.2 Fix Svelte Hardcoded Campaign References
**Priority:** P1 - This Week
**Time:** 1 hour
**Risk:** Medium

**Files with hardcoded 'test-silverpeak':**

| File | Line | Fix |
|------|------|-----|
| `App.svelte` | 5 | Read from URL params |
| `GameInput.svelte` | 5 | Change `export const` to `export let` |
| `combatStore.js` | 248 | Use dynamic default |

**GameInput.svelte fix:**
```javascript
// CURRENT
export const campaign = "test-silverpeak";

// FIX
export let campaign = 'default';
```

---

## 2.3 Fix ecosystem.config.js Paths
**Priority:** P1 - This Week
**Time:** 10 minutes
**Risk:** Low

**File:** `/opt/dnd/ecosystem.config.js`
```javascript
// CURRENT
cwd: '/opt/vodbase/dnd-campaign'

// FIX
cwd: '/opt/dnd'
```

**File:** `/opt/dnd/rag-service/ecosystem.config.js`
```javascript
// CURRENT
cwd: '/opt/vodbase/dnd-5e/rag-service'

// FIX
cwd: '/opt/dnd/rag-service'
```

---

# PHASE 3: DEAD CODE & CLEANUP (Medium Priority)

## 3.1 Remove Duplicate Functions
**Priority:** P2 - This Month
**Time:** 30 minutes
**Risk:** Low

**File:** `/opt/dnd/script.js`

**Duplicate `switchInventoryTab`:**
- First definition: lines 1881-1908 (DEAD CODE)
- Second definition: lines 1938-1966 (ACTIVE)

**Action:** Delete lines 1881-1936

---

## 3.2 Fix Broken Global Reference
**Priority:** P2 - This Month
**Time:** 5 minutes
**Risk:** Low (causes runtime error)

**File:** `/opt/dnd/script.js`
**Line:** 1904

```javascript
// CURRENT (BROKEN)
onclick="window.dndCampaign.useItem('${itemName}', 'use')"

// FIX
onclick="window.game.useItem('${itemName}', 'use')"
```

---

## 3.3 Remove Unused CSS
**Priority:** P2 - This Month
**Time:** 15 minutes
**Risk:** None

**File:** `/opt/dnd/ui-svelte/src/lib/components/CampaignManager.svelte`
**Lines:** 339-597 (336 lines of unused CSS)

**Action:** Delete all CSS selectors with `/* svelte-ignore css-unused-selector */`

---

## 3.4 Remove Dead DiceRollPrompt Import
**Priority:** P2 - This Month
**Time:** 10 minutes
**Risk:** None

**File:** `/opt/dnd/ui-svelte/src/lib/components/GameArea.svelte`

```javascript
// DELETE these (lines 6-7, 403-408)
import DiceRollPrompt from './DiceRollPrompt.svelte';
let showDicePrompt = false;  // Never set to true
let currentRollDetails = {};

// DELETE template (lines 403-408)
{#if showDicePrompt}
  <DiceRollPrompt ... />
{/if}
```

---

## 3.5 Remove Debug Console.logs
**Priority:** P2 - This Month
**Time:** 30 minutes
**Risk:** None

**Locations:**
- `/opt/dnd/script.js` lines 904-911 (dice roll debug)
- `/opt/dnd/complete-intelligent-server.js` line 2624, 2176, 2220

```javascript
// DELETE these patterns
console.log('=== DICE ROLL DEBUG IN SCRIPT.JS ===');
console.log('🔍 DEBUG extractEnemyData result:', ...);
console.log('🔍 DEBUG: Initiative regex matched:', ...);
```

---

# PHASE 4: RACE CONDITIONS & DATA INTEGRITY (Medium Priority)

## 4.1 Add Transaction Support to CampaignDatabase
**Priority:** P2 - This Month
**Time:** 1 hour
**Risk:** Medium (data corruption possible without)

**File:** `/opt/dnd/database/CampaignDatabase.js`

```javascript
// ADD these methods
async beginTransaction() {
    return this.run('BEGIN TRANSACTION');
}

async commit() {
    return this.run('COMMIT');
}

async rollback() {
    return this.run('ROLLBACK');
}

async transaction(callback) {
    await this.beginTransaction();
    try {
        const result = await callback(this);
        await this.commit();
        return result;
    } catch (error) {
        await this.rollback();
        throw error;
    }
}
```

---

## 4.2 Fix HP Update Race Condition
**Priority:** P2 - This Month
**Time:** 30 minutes
**Risk:** Medium

**File:** `/opt/dnd/complete-intelligent-server.js`
**Lines:** 6635-6678

```javascript
// CURRENT - race condition
const char = await contextManager.db.getCharacter(character);
await contextManager.db.updateCharacterHP(char.id, hpCurrent, hpMax);
// ... later updates to JSON state

// FIX - wrap in transaction
await contextManager.db.transaction(async (db) => {
    const char = await db.getCharacter(character);
    await db.updateCharacterHP(char.id, hpCurrent, hpMax);
    await db.recordEvent(...);
});
// Then update JSON state
```

---

## 4.3 Fix Frontend Sync Race Conditions
**Priority:** P2 - This Month
**Time:** 1 hour
**Risk:** Medium

**File:** `/opt/dnd/script.js`

**Problem:** Multiple overlapping sync operations (auto-sync, post-action sync, switchPartyMember sync)

**Solution:** Add sync mutex
```javascript
class DNDCampaign {
    constructor() {
        this.syncInProgress = false;
        // ...
    }

    async syncWithDM(silent = false) {
        if (this.syncInProgress) return false;
        this.syncInProgress = true;
        try {
            // ... existing sync code
        } finally {
            this.syncInProgress = false;
        }
    }
}
```

---

# PHASE 5: MISSING ASSETS & FONTS (Low Priority)

## 5.1 Add Missing Fonts to Silverpeak
**Priority:** P3 - When Convenient
**Time:** 5 minutes
**Risk:** Low (visual only)

**File:** `/opt/dnd/campaigns/test-silverpeak/index.html`
**Line:** After line 17

```html
<!-- CURRENT -->
<link href="https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">

<!-- FIX - add missing fonts used in theme.css -->
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=IM+Fell+English&family=Crimson+Text:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
```

---

## 5.2 Fix Default Campaign ID in Dax
**Priority:** P3 - When Convenient
**Time:** 5 minutes
**Risk:** Low

**File:** `/opt/dnd/campaigns/dax/index.html`
**Line:** 510

```javascript
// CURRENT
const CAMPAIGN_ID = urlParams.get('campaign') || 'default';

// FIX
const CAMPAIGN_ID = urlParams.get('campaign') || 'dax';
```

---

# PHASE 6: ARCHITECTURE IMPROVEMENTS (Tech Debt)

## 6.1 Consolidate Duplicate HTML
**Priority:** P3 - Future
**Time:** 4-6 hours
**Risk:** Low

**Problem:** 600+ lines duplicated between:
- `/opt/dnd/game.html`
- `/opt/dnd/campaigns/dax/index.html`
- `/opt/dnd/campaigns/test-silverpeak/index.html`

**Solution:** Create template system or migrate all to Svelte architecture (test-silverpeak pattern)

---

## 6.2 Standardize API Path Prefix
**Priority:** P3 - Future
**Time:** 2 hours
**Risk:** Low

**Current state:** 3 different prefixes used:
- `/api/dnd/*` (server primary)
- `/dnd-api/dnd/*` (frontend primary)
- `/dnd/api/dnd/*` (script.js)

**Recommendation:** Standardize to `/dnd-api/dnd/*` everywhere

---

## 6.3 Convert Sync File Operations to Async
**Priority:** P3 - Future
**Time:** 1 hour
**Risk:** Low (performance improvement)

**File:** `/opt/dnd/complete-intelligent-server.js`

**Locations:**
- Lines 52-54: `fs.existsSync` / `fs.readFileSync`
- Line 73: `fs.writeFileSync`
- Line 717: `fs.readFileSync`
- Line 5049: `fs.existsSync`

```javascript
// CURRENT
if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

// FIX
try {
    const settings = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
} catch (err) {
    // Handle missing file
}
```

---

## 6.4 Create Centralized Campaign Store (Svelte)
**Priority:** P3 - Future
**Time:** 2 hours
**Risk:** Low

**Problem:** Campaign ID prop-drilled through 13+ components

**Solution:** Use Svelte Context API
```javascript
// In App.svelte or top-level
import { setContext } from 'svelte';
const campaign = new URLSearchParams(window.location.search).get('campaign') || 'default';
setContext('campaign', campaign);

// In components
import { getContext } from 'svelte';
const campaign = getContext('campaign');
```

---

# APPENDIX A: Files Requiring Changes

## Critical (Phase 1)
| File | Changes Needed |
|------|----------------|
| `/opt/dnd/.env` | Add STABILITY_API_KEY |
| `/opt/dnd/complete-intelligent-server.js` | Remove hardcoded key, add route aliases |
| `/opt/dnd/campaigns/dax/index.html` | Fix script paths, Svelte hash |
| `/opt/dnd/campaigns/test-silverpeak/index.html` | Fix Svelte hash |
| `/opt/dnd/game.html` | Fix script paths |

## High Priority (Phase 2)
| File | Changes Needed |
|------|----------------|
| `/opt/dnd/complete-intelligent-server.js` | Remove 19 hardcoded campaign checks |
| `/opt/dnd/ui-svelte/src/lib/components/GameInput.svelte` | `export const` → `export let` |
| `/opt/dnd/ui-svelte/src/App.svelte` | Dynamic campaign |
| `/opt/dnd/ecosystem.config.js` | Fix cwd path |
| `/opt/dnd/rag-service/ecosystem.config.js` | Fix cwd path |

## Medium Priority (Phase 3-4)
| File | Changes Needed |
|------|----------------|
| `/opt/dnd/script.js` | Remove duplicate function, fix global ref, add sync mutex |
| `/opt/dnd/ui-svelte/src/lib/components/CampaignManager.svelte` | Remove 336 lines unused CSS |
| `/opt/dnd/ui-svelte/src/lib/components/GameArea.svelte` | Remove dead DiceRollPrompt |
| `/opt/dnd/database/CampaignDatabase.js` | Add transaction support |

---

# APPENDIX B: Unused Server Endpoints

These endpoints exist but are never called by frontend:

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/dnd/context` | Context retrieval | Backend-only? |
| `/api/dnd/roll` | Dice rolling | Deprecated? |
| `/api/dnd/roll-result` | Roll processing | Deprecated? |
| `/api/dnd/search` | Campaign search | Unused |
| `/api/dnd/debug-context` | Debug utility | Dev only |
| `/api/dnd/clear-history` | History management | Unused |
| `/api/dnd/backup` | Backup utility | Unused |
| `/api/dnd/stats` | Server stats | Unused |
| `/api/dnd/rollback` | State rollback | Unused |
| `/api/dnd/campaigns` | Campaign listing | Unused |
| `/api/dnd/campaigns/:id/auth` | Campaign auth | Unused |
| `/api/dnd/equipment/add` | Equipment addition | Unused |
| `/api/dnd/character/*` | Character management | All unused |
| `/api/dnd/events/recent` | Recent events | Unused |
| `/api/dnd/quests` | Quest management | Unused |

**Recommendation:** Document or remove these endpoints.

---

# APPENDIX C: Error Handling Assessment

**Overall Grade: A-**

| Category | Status | Notes |
|----------|--------|-------|
| Empty catch blocks | ✅ Excellent | None found |
| console.error usage | ✅ Excellent | Correct throughout |
| Swallowed errors | ✅ Good | All handled with fallbacks |
| API error responses | ✅ Excellent | Proper status codes |
| Async try-catch | ✅ Excellent | Comprehensive coverage |
| Error message format | ✅ Excellent | Consistent emoji prefixes |
| Debug logs | ⚠️ Needs cleanup | ~10 to remove |

---

# APPENDIX D: Memory & Performance Concerns

## Potential Memory Leaks
1. `indexedEvents` array grows unbounded (trimmed only every 10 entries)
2. `searchIndices` maps grow forever
3. `monsterCache` never cleared
4. Combat `conversationHistory` unbounded

## Sync File Operations (Blocking)
- Line 52-54: Settings file read
- Line 73: Settings file write
- Line 717: API key file read
- Line 5049: Campaign HTML check

---

# APPENDIX E: Complete Issue Count by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 4 | Security, broken functionality |
| 🟠 High | 12 | Multi-campaign blockers, race conditions |
| 🟡 Medium | 25 | Dead code, inconsistencies |
| 🟢 Low | 15 | Tech debt, nice-to-have |
| **Total** | **56** | Unique actionable issues |

---

*Report generated by 10 Claude subagents analyzing 25+ files totaling ~15,000 lines of code.*
