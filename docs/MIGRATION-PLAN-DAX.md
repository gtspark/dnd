# Dax Campaign Migration Plan

**Goal**: Merge dnd-dax into dnd-5e so that `?campaign=dax` works like `?campaign=test-silverpeak`

**Current State**:
- dnd-5e: 6,903 line server, full D&D 5e tools, DB/RAG support, Silverpeak-hardcoded
- dnd-dax: 2,709 line server, simpler, 364 messages of campaign history
- Backup exists at `/opt/dnd/dax-campaign-backup/`

---

## Phase 1: Server Code Changes (complete-intelligent-server.js)

### 1.1 Fix Default Campaign ID (13 occurrences)

Change all `|| 'test-silverpeak'` to `|| 'default'` or make configurable:

| Line | Current | Change To |
|------|---------|-----------|
| 5296 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5326 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5403 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5424 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5444 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5508 | `req.query.campaign \|\| 'test-silverpeak'` | `req.query.campaign \|\| 'default'` |
| 5597 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5755 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5782 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5806 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5832 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5858 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |
| 5904 | `campaignId \|\| campaign \|\| 'test-silverpeak'` | `campaignId \|\| campaign \|\| 'default'` |

### 1.2 Generalize Feature Gates (18 occurrences)

These check `if (campaign === 'test-silverpeak')` and either enable features or reject requests.

**Strategy**: Change from campaign-name checks to capability checks.

#### DB/RAG Gates (keep Silverpeak-only for now, but make graceful):
- Line 993: DB init - keep as-is (Dax doesn't need DB)
- Line 1008: RAG init - keep as-is (Dax doesn't need RAG)
- Line 2376, 2754, 3215, 3554: RAG/DB operations - already check `if (this.memoryClient && ...)`, safe

#### Equipment/HP/Credits API Gates (MUST FIX):
These currently return 400 for non-Silverpeak. Change to use structure detection:

```javascript
// Line 6472 - Equipment API
// BEFORE:
if (campaign !== 'test-silverpeak') {
    return res.status(400).json({ error: 'Equipment API only available for Silverpeak campaign' });
}

// AFTER:
const context = await getCampaignContext(campaign);
const isFantasy = context.campaignState?.characters !== undefined;
if (!isFantasy) {
    return res.status(400).json({ error: 'Equipment API only available for fantasy campaigns' });
}
```

Apply similar pattern to lines: 6511, 6565, 6618, 6664, 6706, 6751, 6803, 6828

**Alternative**: Sci-fi campaigns don't need these APIs (single inventory, no equipment/spells). Could keep the gates but change error message to be clearer.

### 1.3 Fix Hardcoded NPC/Location Patterns (lines 1355-1392)

Current code has Silverpeak-specific patterns:
```javascript
const npcPatterns = ['kira', 'thorne', 'riven', 'innkeeper', ...];
const locationPatterns = ['thornhaven', 'laughing griffin', 'silverpeak', ...];
```

**Fix**: Move these to campaign-specific config files or make them optional.

### 1.4 Fix Pre-loaded Context (line 3915)

```javascript
// BEFORE:
const contextManager = new IntelligentContextManager('test-silverpeak');

// AFTER:
// Either remove pre-loading entirely (lazy load all campaigns)
// Or pre-load based on config/env var
const DEFAULT_CAMPAIGN = process.env.DEFAULT_CAMPAIGN || 'test-silverpeak';
const contextManager = new IntelligentContextManager(DEFAULT_CAMPAIGN);
```

---

## Phase 2: Create campaigns/dax/ Folder

### 2.1 Copy Data Files

```bash
mkdir -p /opt/dnd/dnd-5e/campaigns/dax

# From dnd-dax/campaigns/default/
cp /opt/dnd/dnd-dax/campaigns/default/conversation-history.json /opt/dnd/dnd-5e/campaigns/dax/
cp /opt/dnd/dnd-dax/campaigns/default/campaign-state.json /opt/dnd/dnd-5e/campaigns/dax/
cp /opt/dnd/dnd-dax/campaigns/default/SEARCH_INDEX.json /opt/dnd/dnd-5e/campaigns/dax/

# DM prompt
cp /opt/dnd/dnd-dax/dm-system-prompt.md /opt/dnd/dnd-5e/campaigns/dax/dm-prompt.md
```

### 2.2 Add mode field to conversation history

The Dax conversation history is missing the `"mode": "ic"` field that Silverpeak uses.

```javascript
// Script to add mode field:
const history = require('./conversation-history.json');
const updated = history.map(entry => ({
    ...entry,
    mode: entry.mode || 'ic'
}));
fs.writeFileSync('./conversation-history.json', JSON.stringify(updated, null, 2));
```

### 2.3 Create campaign-config.js

```javascript
const config = {
    campaignId: 'dax',
    campaignName: 'Titan Station Crisis',
    genre: 'sci-fi',

    characters: [
        {
            id: 'dax',
            name: 'Dax Stargazer',
            race: 'Vexian',
            class: 'Tech Specialist',
            image: 'dax-portrait.png',
            hp: { current: 9, max: 9 },
            credits: 3000,
            inventory: []
        },
        {
            id: 'chen',
            name: 'Chen',
            race: 'Human',
            class: 'Security Specialist',
            image: null,
            hp: { current: 24, max: 24 },
            credits: 800,
            inventory: []
        },
        {
            id: 'yuen',
            name: 'Dr. Yuen',
            race: 'Human',
            class: 'Medical Officer',
            image: null,
            hp: { current: 16, max: 16 },
            credits: 12000,
            inventory: []
        }
    ],

    defaultCharacter: 'dax',
    localStoragePrefix: 'dax',

    currencyName: 'Credits',
    currencyAbbrev: 'CR',
    startingCredits: 3000,

    // Sci-fi specific
    mechanics: {
        abilityScores: false,
        spellcasting: false,
        techSkills: true,
        shipStatus: true
    },

    ui: {
        inventoryTabs: ['inventory'], // Single tab, not 3
        showShipStatus: true
    },

    theme: {
        primaryColor: '#1e40af',
        accentColor: '#fbbf24'
    }
};

if (typeof window !== 'undefined') {
    window.campaignConfig = config;
}
if (typeof module !== 'undefined') {
    module.exports = config;
}
```

### 2.4 Create index.html

**Option A**: Use legacy game.html (simpler, already works for Dax)
- Copy `/opt/dnd/dnd-5e/game.html` to `/opt/dnd/dnd-5e/campaigns/dax/index.html`
- Update paths to be relative
- This works because legacy Dax frontend is already sci-fi

**Option B**: Create new shared-core based index.html (more work)
- Would need to modify campaign-base.js to support single inventory tab
- Would need ship status component
- Estimated 4-6 hours additional work

**Recommendation**: Start with Option A, migrate to Option B later.

### 2.5 Create theme.css (sci-fi colors)

```css
:root {
    --primary-color: #1e40af;
    --accent-color: #fbbf24;
    --bg-dark: #0a0e27;
    --bg-medium: #1a1f3a;
    --text-primary: #e8f0f8;
    --text-secondary: #94a3b8;
}
```

### 2.6 Copy character portraits

```bash
cp "/opt/dnd/dnd-dax/dax pfp.png" /opt/dnd/dnd-5e/campaigns/dax/
cp /opt/dnd/dnd-dax/dax-portrait.png /opt/dnd/dnd-5e/campaigns/dax/
```

---

## Phase 3: Update campaigns-index.json

```json
{
  "campaigns": [
    {
      "id": "test-silverpeak",
      "name": "Silverpeak Chronicles",
      "genre": "high-fantasy",
      "created": "2025-10-04T00:00:00",
      "characters": ["Kira", "Thorne", "Riven"],
      "description": "High fantasy world with D&D 5e mechanics"
    },
    {
      "id": "dax",
      "name": "Titan Station Crisis",
      "genre": "sci-fi",
      "created": "2025-09-20T00:00:00",
      "characters": ["Dax", "Chen", "Dr. Yuen"],
      "description": "Sci-fi space opera investigation campaign"
    }
  ]
}
```

---

## Phase 4: Update splash.html

Update `/opt/dnd/dnd-5e/splash.html` to link to `?campaign=dax` instead of `/dnd-dax/game.html`:

```html
<!-- Dax Campaign Card -->
<div class="campaign-card" onclick="window.location.href='game.html?campaign=dax'">
```

---

## Phase 5: Test & Verify

1. Start server: `node complete-intelligent-server.js`
2. Test Silverpeak still works: `http://localhost:3001/dnd/game.html?campaign=test-silverpeak`
3. Test Dax works: `http://localhost:3001/dnd/game.html?campaign=dax`
4. Verify conversation history loads
5. Verify state sync works
6. Test a DM action
7. Verify splash page links work

---

## Phase 6: Delete dnd-dax

Once everything is verified working:

```bash
rm -rf /opt/dnd/dnd-dax
```

---

## Estimated Time

| Phase | Task | Time |
|-------|------|------|
| 1 | Server code changes | 1-2 hours |
| 2 | Create campaigns/dax/ | 30 min |
| 3 | Update campaigns-index.json | 5 min |
| 4 | Update splash.html | 5 min |
| 5 | Testing | 30 min |
| 6 | Delete dnd-dax | 1 min |
| **Total** | | **2.5-3.5 hours** |

---

## Risks

1. **Conversation history format mismatch** - May need to transform entries
2. **Legacy frontend assumptions** - game.html hardcodes Dax/Chen/Yuen names
3. **State structure edge cases** - Some code paths may not handle sci-fi structure
4. **PM2 process update** - Need to restart the service after changes

## Rollback Plan

If anything breaks:
1. Restore from `/opt/dnd/dax-campaign-backup/`
2. Keep dnd-dax folder as fallback
3. Revert server changes via git
