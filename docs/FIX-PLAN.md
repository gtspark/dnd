# D&D Campaign Manager - Fix Plan
**Based on:** AUDIT-REPORT-2024-12-09.md
**Estimated Total Time:** 12-15 hours across 6 phases

---

## Quick Reference: What's Broken Right Now

| Issue | Impact | Fix Time |
|-------|--------|----------|
| Dax campaign won't load | 🔴 Broken | 15 min |
| Svelte components won't mount | 🔴 Broken | 10 min |
| AI Provider settings broken | 🟠 Broken | 20 min |
| Scene generation broken | 🟠 Broken | 10 min |
| API key exposed in code | 🔴 Security | 5 min |

---

## Phase 1: Emergency Fixes (1 hour)
*Get everything working again*

### Batch 1A: Security (5 min)
```bash
# Add to .env
echo "STABILITY_API_KEY=ASK_CHRIS_FOR_NEW_STABILITY_KEY" >> /opt/dnd/.env

# Then edit complete-intelligent-server.js line 6383
# Change: const STABILITY_API_KEY = 'sk-...'
# To:     const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

# IMPORTANT: Rotate this key in Stability AI dashboard!
```

### Batch 1B: Fix Broken Scripts (25 min)
**Files:** `game.html`, `campaigns/dax/index.html`

Replace script references:
```html
<!-- OLD -->
<script src="api-handler.js?v=..."></script>
<script src="script.js?v=..."></script>

<!-- NEW -->
<script src="/dnd/shared/api-handler-base.js?v=..."></script>
<script src="/dnd/shared/campaign-base.js?v=..."></script>
<script src="/dnd/campaigns/dax/campaign-config.js?v=..."></script>
```

### Batch 1C: Fix Svelte Hash (10 min)
**Files:** Both campaign index.html files

```html
<!-- OLD (wrong hash) -->
index-DpGllzxI.js

<!-- NEW (correct hash) -->
index-C8l6J5-K.js
```

### Batch 1D: Add Missing API Aliases (20 min)
**File:** `complete-intelligent-server.js`

Add multi-path support for:
- `/api/dnd/ai-provider` (GET + POST)
- `/api/dnd/generate-scene` (POST)

---

## Phase 2: Multi-Campaign Support (3-4 hours)
*Make campaigns actually independent*

### Batch 2A: Create Campaign Feature Config (30 min)
```javascript
// /opt/dnd/campaign-features.js
module.exports = {
    'test-silverpeak': {
        usesDatabase: true,
        usesRAG: true,
        genre: 'fantasy',
        hasEquipmentAPI: true,
        hasSpellsAPI: true
    },
    'dax': {
        usesDatabase: false,
        usesRAG: false,
        genre: 'scifi',
        hasEquipmentAPI: false,
        hasSpellsAPI: false,
        hasShipStatus: true
    },
    'default': {
        usesDatabase: false,
        usesRAG: false,
        genre: 'fantasy',
        hasEquipmentAPI: false
    }
};
```

### Batch 2B: Replace Hardcoded Checks (2-3 hours)
**File:** `complete-intelligent-server.js`

Replace all 19 instances of:
```javascript
// OLD
if (this.campaignId === 'test-silverpeak') { ... }

// NEW
const features = require('./campaign-features')[this.campaignId] || {};
if (features.usesDatabase) { ... }
```

### Batch 2C: Fix Svelte Campaign Props (30 min)
**Files:**
- `GameInput.svelte`: `export const` → `export let`
- `App.svelte`: Read from URL params
- `combatStore.js`: Dynamic default

### Batch 2D: Fix PM2 Configs (10 min)
**Files:**
- `ecosystem.config.js`: Fix cwd path
- `rag-service/ecosystem.config.js`: Fix cwd path

---

## Phase 3: Dead Code Removal (1-2 hours)
*Clean up the codebase*

### Batch 3A: script.js Cleanup (30 min)
- [ ] Delete duplicate `switchInventoryTab` (lines 1881-1936)
- [ ] Fix `window.dndCampaign` → `window.game` (line 1904)
- [ ] Remove debug console.logs (lines 904-911)
- [ ] Add sync mutex to prevent race conditions

### Batch 3B: Svelte Cleanup (30 min)
- [ ] Delete 336 lines unused CSS from `CampaignManager.svelte`
- [ ] Remove dead `DiceRollPrompt` from `GameArea.svelte`
- [ ] Remove commented code in `interceptLegacySystem`

### Batch 3C: Server Cleanup (30 min)
- [ ] Remove debug console.logs (lines 2176, 2220, 2624)
- [ ] Remove dead code paths (lines 1280-1283, 2424-2436)
- [ ] Clean up commented code (lines 3210-3212)

---

## Phase 4: Data Integrity (2-3 hours)
*Prevent data corruption*

### Batch 4A: Database Transactions (1 hour)
**File:** `database/CampaignDatabase.js`

Add:
- `beginTransaction()`
- `commit()`
- `rollback()`
- `transaction(callback)` helper

### Batch 4B: Fix Race Conditions (1-2 hours)
**Files:** `complete-intelligent-server.js`, `script.js`

- Wrap HP/equipment updates in transactions
- Add sync mutex to frontend
- Add `inFlight` guards to combat store

---

## Phase 5: Missing Assets (30 min)
*Visual polish*

### Batch 5A: Fonts (5 min)
Add Cinzel and IM Fell English fonts to Silverpeak HTML

### Batch 5B: Default Campaign IDs (10 min)
- Dax should default to 'dax', not 'default'
- Game.html should read from URL or default sensibly

### Batch 5C: Version Sync (15 min)
Create script to update all HTML file versions atomically

---

## Phase 6: Architecture (Future)
*Long-term improvements*

### 6A: Template System
- Create shared HTML template
- Campaign-specific variables injected at serve time
- Eliminate 600+ lines duplication

### 6B: API Path Standardization
- Pick one prefix (`/dnd-api/dnd/`)
- Update all frontend calls
- Deprecate old paths

### 6C: Svelte Context for Campaign
- Use Svelte Context API
- Stop prop-drilling campaign through 13 components

### 6D: Async File Operations
- Convert sync fs calls to async
- Improve server responsiveness

---

## Execution Order Recommendation

```
Week 1:
├── Day 1: Phase 1 (Emergency) - 1 hour
├── Day 2-3: Phase 2 (Multi-Campaign) - 4 hours
└── Day 4: Phase 3 (Dead Code) - 2 hours

Week 2:
├── Day 1-2: Phase 4 (Data Integrity) - 3 hours
├── Day 3: Phase 5 (Assets) - 30 min
└── Day 4+: Phase 6 (Architecture) - ongoing
```

---

## Testing Checklist

### After Phase 1:
- [ ] Dax campaign loads at `?campaign=dax`
- [ ] Silverpeak campaign loads at `?campaign=test-silverpeak`
- [ ] AI Provider settings modal works
- [ ] Scene generation works
- [ ] No console errors on load

### After Phase 2:
- [ ] Both campaigns have independent state
- [ ] Equipment API works for Silverpeak only (by design)
- [ ] RAG/memory works for Silverpeak only (by design)
- [ ] PM2 starts correctly with new configs

### After Phase 3:
- [ ] No duplicate function warnings
- [ ] No broken onclick handlers
- [ ] Clean console (no debug logs)

### After Phase 4:
- [ ] HP updates don't lose data under load
- [ ] Equipment additions are atomic
- [ ] Frontend doesn't make duplicate sync calls

---

## Commands for Each Phase

### Phase 1
```bash
cd /opt/dnd
# After edits:
TIMESTAMP=$(date +%s)
sed -i "s/v=[0-9]*/v=$TIMESTAMP/g" game.html
sed -i "s/v=[0-9]*/v=$TIMESTAMP/g" campaigns/dax/index.html
sed -i "s/v=[0-9]*/v=$TIMESTAMP/g" campaigns/test-silverpeak/index.html
pm2 restart dnd
```

### Phase 2
```bash
cd /opt/dnd
# After creating campaign-features.js and editing server:
pm2 restart dnd
# Test both campaigns
curl -s "http://localhost:3003/dnd-api/dnd/state?campaign=dax" | head
curl -s "http://localhost:3003/dnd-api/dnd/state?campaign=test-silverpeak" | head
```

### Phase 3
```bash
cd /opt/dnd/ui-svelte
npm run ui:build
cd /opt/dnd
pm2 restart dnd
```

### Phase 4
```bash
cd /opt/dnd
# After database changes:
pm2 restart dnd
# Test with concurrent requests
```

---

*Plan created: 2024-12-09*
*Based on 10-agent deep dive audit*
