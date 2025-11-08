# Claude Code TODO List for D&D 5e Campaign System

## Pending Features

### Admin Rollback Endpoint
**Priority**: Medium
**Description**: Implement full admin rollback endpoint (`/dnd-api/dnd/rollback`) that reverses ALL state changes when rolling back conversation history.

**Requirements**:
- Accept rollback index parameter
- Truncate conversation history to target index
- **Reverse all stateChanges** from removed entries:
  - Remove items that were added (equipment, inventory, spells)
  - Restore items that were removed
  - Revert HP changes
  - Revert credit/gold changes
  - Revert condition changes
  - Revert world state changes
- Save both rolled-back conversation history AND rolled-back campaign state
- Return summary of what was rolled back

**Notes**:
- Currently rollback-simple.html calls this endpoint but it doesn't exist
- For testing purposes, we manually rolled back conversation only (keeping equipment/spells)
- Production rollback should be a careful admin action that undoes everything

**Related Files**:
- `/opt/vodbase/dnd-5e/rollback-simple.html` (line 218-276)
- `/opt/vodbase/dnd-5e/complete-intelligent-server.js` (needs new endpoint)

---

## Completed Features

### Combat System
- ✅ Combat Manager with initiative tracking, action economy, HP tracking
- ✅ Separate combat conversations (isolated from narrative)
- ✅ Combat API endpoints
- ✅ Combat UI components (action economy bar, mode pill)
- ✅ UI event wiring for player actions
