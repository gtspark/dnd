# Multi-Campaign System - Directory Structure

## Directory Layout
```
/opt/bitnami/apache/htdocs/dnd-campaign/
├── index.html                    # NEW: Splash page with campaign tiles
├── game.html                     # RENAMED: Current game UI (was index.html)
├── campaigns/
│   ├── campaigns-index.json      # Master list of all campaigns
│   └── default/                  # Default campaign (existing data)
│       ├── conversation-history.json
│       ├── campaign-state.json
│       ├── EMERGENCY-CAMPAIGN-EXPORT-2025-09-23.md
│       └── generated-scenes/
```

## campaigns-index.json Schema
```json
{
  "campaigns": [
    {
      "id": "default",
      "name": "Titan Station Adventure",
      "created": "2025-09-20T00:00:00.000Z",
      "lastPlayed": "2025-10-02T15:40:10.938Z",
      "passwordHash": "$2b$10$...",
      "characters": ["Dax", "Chen", "Dr. Yuen"],
      "description": "Investigation on Titan Station",
      "thumbnail": "/dnd/campaigns/default/generated-scenes/latest.png"
    }
  ]
}
```

## Authentication Flow
1. User clicks campaign tile on splash
2. Password modal appears
3. POST to /api/dnd/campaigns/{id}/auth with password
4. Server validates, returns JWT token
5. Token stored in cookie: dnd_campaign_{id}_auth
6. Game loads with campaign-id in URL: /dnd/game.html?campaign=default
7. All API calls include campaign-id

## Phase 1 Scope
- ✅ Splash page with campaign tiles
- ✅ Password protection with cookies
- ✅ Campaign isolation (separate directories)
- ❌ Create new campaign (Phase 2)
