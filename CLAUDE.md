# D&D Campaign Manager - Claude Code Configuration

## Project Overview
Interactive D&D campaign management web application with real-time character sheets, dice rolling, and AI-powered dungeon mastering.

## Server Setup
- **Technology**: Node.js/Express enhanced server
- **Process Manager**: PM2 (process name: `dnd-enhanced`)
- **Location**: `/opt/bitnami/apache/htdocs/dnd-campaign/`
- **URL**: https://vodbase.net/dnd/
- **Port**: 3001, proxied through Apache (`/dnd-api/` → `http://localhost:3001/api/`)
- **Main Server**: `complete-intelligent-server.js` handles full campaign context and AI integration

## ⚠️ CRITICAL: Architecture Overview

### Two-System Architecture (As of 2025-10-05)

**System 1: Dax Campaign (Legacy Alpha - LOCKED)**
```
/dnd/game.html              ← Dax's dedicated UI
/dnd/script.js              ← Dax's dedicated logic
/dnd/styles.css             ← Dax's dedicated styling
/dnd/api-handler.js         ← Dax's dedicated API handler
/dnd/campaigns/default/     ← Dax's data (364+ messages)
```
- **Status**: Production-stable, 364 conversation entries
- **DO NOT MODIFY**: Locked legacy system to preserve campaign history
- **Access**: `https://vodbase.net/dnd/game.html` (direct URL, no campaign param)
- **Reason**: First campaign, built before shared system existed

**System 2: Shared Core (New Campaigns)**
```
/dnd/shared/
├── campaign-base.js        ← Shared game engine
├── campaign-base.css       ← Shared base styling
└── api-handler-base.js     ← Shared API handler

/dnd/campaigns/test-silverpeak/
├── index.html              ← Campaign-specific HTML
├── campaign-config.js      ← Fantasy settings
├── theme.css              ← Purple/gold fantasy theme
├── dm-prompt.md           ← Fantasy DM personality
├── conversation-history.json
└── campaign-state.json
```
- **Status**: Production-ready for new fantasy campaigns
- **Access**: `https://vodbase.net/dnd/?campaign=test-silverpeak`
- **Features**: Inventory/Equipment/Spells tabs, traditional D&D mechanics

### Why Two Systems?

**Technical Debt Decision**: Rather than risk Dax's 364-message history on an untested migration, we built the shared system as a parallel track. Dax remains on the original codebase as a working "alpha version" while all new campaigns use the improved shared architecture.

**Migration Path**: When a third campaign is needed, THEN we'll have two working examples (Dax sci-fi + Silverpeak fantasy) to properly generalize from. Estimated migration effort: 4-5 hours with proper testing.

## Key Commands
- **Check server status**: `pm2 list`
- **Restart server**: `pm2 restart dnd-enhanced`
- **View logs**: `cat ~/.pm2/logs/dnd-server-out.log | tail -20`
- **Error logs**: `cat ~/.pm2/logs/dnd-server-error.log | tail -20`
- **Live monitoring**: `pm2 monit` (exit with Ctrl+C)

## After Making Changes

### For Dax (Legacy System)
```bash
TIMESTAMP=$(date +%s)
sed -i "s/styles\.css?v=[0-9]*/styles.css?v=$TIMESTAMP/" game.html
sed -i "s/script\.js?v=[0-9]*/script.js?v=$TIMESTAMP/" game.html
pm2 restart dnd-enhanced
```

### For Silverpeak (Shared System)
```bash
TIMESTAMP=$(date +%s)
cd /opt/bitnami/apache/htdocs/dnd-campaign/campaigns/test-silverpeak
sed -i "s/campaign-base\.js?v=[0-9]*/campaign-base.js?v=$TIMESTAMP/" index.html
sed -i "s/campaign-base\.css?v=[0-9]*/campaign-base.css?v=$TIMESTAMP/" index.html
pm2 restart dnd-enhanced  # Only needed for backend changes
```

## Current Production Features (2025-10-05)

### ✅ Dual-Campaign System
- **Dax Campaign (Legacy)**: Sci-fi space opera, 364+ messages, ship status, sci-fi inventory
- **Silverpeak Campaign (Shared)**: High fantasy, inventory/equipment/spells tabs, traditional D&D
- **Backend Dual-Structure Support**: Automatically detects fantasy vs sci-fi campaign structure
- **Campaign Isolation**: Complete data separation, no cross-contamination

### ✅ Multi-AI DM System
- **Three AI Providers**: Claude (Sonnet 4), DeepSeek, GPT-4
- **Hot-Swappable**: Switch providers via settings cogwheel (⚙️)
- **Campaign-Specific**: Each campaign has independent AI provider setting
- **Response Labeling**: Shows which AI generated each response

### ✅ Two-Phase Dice Roll System
- **Phase 1**: AI describes setup + requests roll (stops immediately)
- **Phase 2**: After roll, AI generates outcome based on result
- **Benefit**: Proper narrative causality - dice actually determine outcomes
- **No More**: "Technology Check: 21" fake results

### ✅ AI-Powered State Extraction (Multi-Structure)
- **Auto-Update**: DM responses automatically update credits, inventory, HP, conditions
- **Structure Detection**: Fantasy (characters.{name}.equipment/spells) vs Sci-fi (party.{name}.inventory)
- **Smart Categorization**: AI distinguishes consumables (inventory) vs worn gear (equipment)
- **Background Process**: Second AI call extracts state changes as JSON
- **Rollback Integration**: State changes stored with conversation for rollback
- **dm-question Mode Support**: Meta questions can also trigger state updates

### ✅ Traditional D&D Inventory System (Silverpeak)
- **Three-Tab System**: Inventory (consumables) | Equipment (worn gear) | Spells
- **Per-Character**: Each character has separate tabs
- **Auto-Sync**: Server state updates populate frontend automatically
- **Smart Extraction**: AI categorizes items based on type (potion → inventory, armor → equipment)

### ✅ Scene Image Generation
- **Stability AI**: Generates 16:9 scene images from recent conversation
- **Campaign-Aware**: Sci-fi aesthetic for Dax, fantasy aesthetic for Silverpeak
- **Two-Step**: AI extracts scene description → Stability AI generates image
- **Storage**: `/campaigns/{id}/generated-scenes/`

### ✅ DM Game Bible (Adventure Tools)
- **At-a-Glance**: Scene status, party credits, active conditions
- **Modals**: Party status, campaign intel, quests, inventory, recent activity
- **Read-Only**: DM-authoritative data, player notes only editable section
- **Real-Time Sync**: Updates from server via `/api/dnd/state`

## Active Campaigns

### Titan Station Crisis (Dax - Legacy)
- **URL**: `https://vodbase.net/dnd/game.html`
- **Genre**: Sci-fi space opera
- **Characters**: Dax (Engineer), Chen (Security), Dr. Yuen (Medical)
- **Scene**: Secure quarters after neutralizing Osprey surveillance drone
- **Active Plot**: Legal meeting approaching, bioweapons evidence gathered
- **Conversation History**: 364+ entries
- **System**: Legacy (dedicated files)

### Silverpeak Chronicles (Test Campaign - Shared)
- **URL**: `https://vodbase.net/dnd/?campaign=test-silverpeak`
- **Genre**: High fantasy (original world, not Forgotten Realms)
- **Characters**: Kira (Rogue), Thorne (Battle Cleric), Riven (Ranger)
- **Scene**: Laughing Griffin tavern in Thornhaven Village
- **Active Plot**: Investigate shadow creatures in Whispering Woods
- **Conversation History**: ~11 entries (test campaign)
- **System**: Shared core

## Backend Architecture

### Dual-Structure State Management

**Fantasy Structure** (Silverpeak):
```json
{
  "characters": {
    "thorne": {
      "hp": { "current": 24, "max": 24 },
      "credits": 500,
      "inventory": ["Healing Potion", "Rations"],
      "equipment": ["Holy Symbol", "Shield"],
      "spells": ["Cure Wounds", "Bless"],
      "conditions": []
    }
  },
  "party": {
    "credits": 1500
  }
}
```

**Sci-fi Structure** (Dax):
```json
{
  "party": {
    "dax": {
      "hp": { "current": 9, "max": 9 },
      "credits": 3000,
      "inventory": ["Multi-Tool", "Sidearm"],
      "conditions": []
    }
  },
  "resources": {
    "party_credits": 15800
  },
  "ship": { "hull": 100, "shields": 80 }
}
```

**Structure Detection**: `const isFantasyStructure = campaignState.characters !== undefined`

### State Extraction Flow

1. **Player sends action** in IC or dm-question mode
2. **DM generates response** via chosen AI provider
3. **Extraction AI analyzes response**:
   - Receives player request for context
   - Detects campaign structure (fantasy/sci-fi)
   - Uses appropriate extraction prompt
   - Returns JSON with state changes
4. **Server applies changes** using structure-specific logic
5. **Frontend syncs** and displays in correct tabs

### Character Preset Caching

**Problem Solved**: `getCharacterPreset()` was returning new objects each time, preventing modifications from persisting.

**Solution**: Presets cached in `this.characterPresets{}` map, modifications persist across sync cycles.

## Frontend Architecture

### Shared Core (`/dnd/shared/`)

**campaign-base.js**:
- Core game engine class
- Dual-structure sync support
- Character preset management with caching
- Three-tab inventory system
- DM sync and state updates

**campaign-base.css**:
- Base styling variables
- Responsive grid layouts
- Modal systems
- Card components

**api-handler-base.js**:
- API communication
- Campaign-aware requests

### Campaign-Specific (`/dnd/campaigns/{id}/`)

**index.html**:
- Loads shared core
- Campaign-specific structure

**campaign-config.js**:
```javascript
const CAMPAIGN_CONFIG = {
    campaignId: 'test-silverpeak',
    name: 'Silverpeak Chronicles',
    genre: 'fantasy',
    currencyAbbrev: 'GP',
    currencyLabel: 'Gold Pieces',
    startingCredits: 1500,
    defaultCharacter: 'thorne',
    characters: [
        { id: 'kira', name: 'Kira Shadowstep', ... },
        { id: 'thorne', name: 'Thorne Ironheart', ... },
        { id: 'riven', name: 'Riven Swiftarrow', ... }
    ]
};
```

**theme.css**:
- Campaign-specific colors
- Purple/gold fantasy palette for Silverpeak
- Blue/gold sci-fi palette for Dax (legacy)

**dm-prompt.md**:
- Campaign-specific DM personality
- Genre-appropriate tone and mechanics

## Known Issues & Limitations

### Dax Campaign (Legacy)
- **No Migration Plan**: Retrofitting Dax into shared system requires 4-5 hours of careful work
- **Hardcoded Presets**: Character data in JavaScript, not config file
- **Single Inventory Tab**: No equipment/spells separation (sci-fi doesn't need it)
- **Ship Status**: Only in Dax's legacy UI, not in shared system

### Silverpeak Campaign (Shared)
- **Fantasy-First Design**: UI hardcoded for fantasy tabs, not truly dynamic
- **No Ship Status**: Shared system doesn't support ship/vehicle mechanics yet

### Future Generalization Needs
- **Dynamic Tab System**: Build tabs from campaign config, not hardcoded HTML
- **Conditional Sections**: Show/hide sections based on campaign features
- **Config-Driven Labels**: All text labels from campaign config
- **Theme System**: More robust theming beyond CSS files

## Migration Strategy (When Ready)

### Prerequisites for Migrating Dax
1. **Third campaign exists** - Two working examples to generalize from
2. **Dynamic tab system** - Built and tested in shared core
3. **Ship status support** - Shared system supports vehicle mechanics
4. **Proper backup** - Full Dax campaign export before migration
5. **Testing checklist** - Detailed verification plan
6. **Rollback plan** - Quick restore if migration fails

### Estimated Migration Effort
- **Dynamic tab system**: 60 mins
- **Conditional sections**: 30 mins
- **Config-driven labels**: 15 mins
- **Theme migration**: 30 mins
- **Testing & verification**: 90+ mins
- **Total**: 4-5 hours of careful work

### Not Recommended Until
- User wants a third campaign, making maintenance pain obvious
- Shared system proven with multiple fantasy campaigns
- Clear benefit outweighs migration risk

### Template Extraction from Dax (Future)

When a **Space Opera template** is needed for a new sci-fi campaign:

**Option 1: Extract Without Migration** (~2 hours)
1. Copy Dax's structure to `/campaigns/template-scifi/`
2. Convert hardcoded presets to `campaign-config.js`
3. Extract ship status UI to shared system
4. Clean out Dax's conversation data
5. Document as reusable template
6. **Dax stays on legacy system**

**Option 2: Migrate Dax + Create Template** (~5 hours)
1. Full Dax migration to shared system (4-5 hours)
2. Dax becomes first sci-fi shared campaign
3. Clone Dax as template for future sci-fi games
4. **Dax moves to shared system**

**Recommendation**: Option 1 when first sci-fi template needed. Dax's working 364-message campaign doesn't need the risk.

## Development Workflow

### Campaign Template System

**Available Templates** (Genre-Based):

1. **High Fantasy Template** (`test-silverpeak`)
   - Three-tab inventory: Inventory | Equipment | Spells
   - Traditional D&D mechanics (spell slots, initiative, etc.)
   - Purple/gold aesthetic
   - Character-based structure (`characters.{name}`)
   - Party gold pool
   - Use for: D&D 5e, Pathfinder, fantasy adventures

2. **Space Opera Template** (`default` - Dax's structure)
   - Single inventory tab + Ship Status
   - Sci-fi mechanics (tech skills, zero-g, ship combat)
   - Blue/gold aesthetic
   - Party-based structure (`party.{name}`)
   - Shared credits pool (`resources.party_credits`)
   - Ship/vehicle systems
   - Use for: Sci-fi, Traveller, Starfinder, The Expanse-style games

3. **Future Templates** (Planned)
   - **Horror/Cosmic Horror**: Sanity mechanics, clue tracking, Lovecraftian themes
   - **Cyberpunk**: Cyberware, netrunning, street cred systems
   - **Western**: Reputation, duels, frontier mechanics
   - **Post-Apocalyptic**: Survival resources, radiation, faction systems

### Adding a New Campaign (Template-Based)

**Step 1: Choose Template by Genre**

```bash
# For High Fantasy (D&D-style)
TEMPLATE="test-silverpeak"

# For Space Opera (Sci-fi)
TEMPLATE="default"  # Extract from Dax's legacy system when needed

# Copy template
cp -r /opt/bitnami/apache/htdocs/dnd-campaign/campaigns/$TEMPLATE \
      /opt/bitnami/apache/htdocs/dnd-campaign/campaigns/new-campaign
```

**Step 2: Customize Campaign Identity**

Update `campaign-config.js`:
```javascript
const CAMPAIGN_CONFIG = {
    campaignId: 'new-campaign',  // Change this
    name: 'Your Campaign Name',   // Change this
    genre: 'fantasy',  // or 'scifi', 'horror', etc.
    // ... rest stays template-appropriate
};
```

**Step 3: Theme Customization**

Modify `theme.css` color palette:
- Fantasy: Purple/gold → Your colors (green/silver, red/black, etc.)
- Sci-fi: Blue/gold → Your colors (orange/gray, teal/white, etc.)

**Step 4: DM Personality**

Rewrite `dm-prompt.md`:
- Keep genre-appropriate mechanics from template
- Adjust tone, NPCs, world-building to your setting
- Define house rules or custom systems

**Step 5: Initialize Data**

Clean template data:
- Empty `conversation-history.json`
- Reset `campaign-state.json` to starting state
- Update character names/stats in config

**Step 6: Add to Splash Page**

Update campaigns index with new campaign card

### Debugging State Sync Issues

```bash
# Check server state
curl -s "http://127.0.0.1:3001/api/dnd/state?campaign=test-silverpeak" | python3 -m json.tool

# Check specific character
curl -s "http://127.0.0.1:3001/api/dnd/state?campaign=test-silverpeak" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); \
  print(json.dumps(data['characters']['thorne'], indent=2))"

# Verify conversation history
cat /opt/bitnami/apache/htdocs/dnd-campaign/campaigns/test-silverpeak/conversation-history.json | \
  python3 -c "import sys, json; data = json.load(sys.stdin); \
  print(f'Total: {len(data)}'); print(f'Last: {data[-1][\"role\"]}')"
```

### Common Fixes

**Items not syncing**:
- Check preset caching (`this.characterPresets` exists)
- Verify `updateInventoryFromSync` receives `charactersData`, not `serverState`
- Confirm `refreshSectionDisplay` is called after sync

**Credits showing wrong value**:
- Check structure detection (`isFantasyStructure`)
- Verify extraction prompt matches campaign structure
- Confirm `party.credits` for fantasy, `resources.party_credits` for sci-fi

**Dax data appearing in Silverpeak**:
- Server rejects client state (line 1946 fix)
- Clean campaign-state.json file
- Restart server to reload clean state

---

## Future Vision: Campaign Creation UI

**End Goal**: User-friendly campaign creation wizard on splash page

### Workflow Vision

1. **Genre Selection**
   ```
   ┌─────────────────────────────────────────┐
   │  Choose Your Campaign Genre:            │
   │                                         │
   │  [High Fantasy]  [Space Opera]          │
   │  [Cosmic Horror] [Cyberpunk]            │
   │  [Western]       [Post-Apocalyptic]     │
   └─────────────────────────────────────────┘
   ```

2. **Template Auto-Selection**
   - High Fantasy → Silverpeak template (inventory/equipment/spells)
   - Space Opera → Dax template (ship status, sci-fi inventory)
   - Horror → Future horror template (sanity, clues)
   - Etc.

3. **Campaign Customization Form**
   - Campaign name and description
   - Character creation (names, classes, stats)
   - Starting resources (gold/credits/supplies)
   - Theme color palette picker
   - DM personality slider (gritty ↔ heroic, serious ↔ humorous)

4. **Auto-Generation**
   ```javascript
   generateCampaign({
       genre: 'fantasy',
       name: 'Tomb of Annihilation',
       characters: [...],
       themeColors: { primary: '#8B0000', accent: '#FFD700' }
   });

   // Creates:
   // - /campaigns/tomb-of-annihilation/index.html
   // - /campaigns/tomb-of-annihilation/campaign-config.js
   // - /campaigns/tomb-of-annihilation/theme.css
   // - /campaigns/tomb-of-annihilation/dm-prompt.md
   // - Empty data files
   ```

5. **Instant Play**
   - Campaign card appears on splash page
   - Click to start playing immediately
   - Template mechanics already configured

### Technical Requirements

**Backend**:
- Campaign generation endpoint (`POST /api/dnd/create-campaign`)
- Template cloning logic
- Config file generation from form data
- Theme CSS generation from color picker

**Frontend**:
- Multi-step wizard component
- Character builder UI
- Color palette picker
- Template preview cards

**Templates**:
- Each template has `template.json` metadata describing features
- UI shows template features during selection
- Templates independently maintained as genre archetypes

### Benefits

- **No Manual File Editing**: Everything through UI
- **Template Library Grows**: Each new genre adds reusable template
- **Lower Barrier**: Non-technical users can create campaigns
- **Dax Preserved**: Lives forever as Space Opera archetype template

---

*Last Updated: 2025-10-05*
*Current Status: Dual-system architecture, both campaigns production-ready*
*Active Campaigns: Titan Station (Dax - legacy) | Silverpeak Chronicles (shared)*
*Template System: Genre-based templates for rapid campaign creation*
