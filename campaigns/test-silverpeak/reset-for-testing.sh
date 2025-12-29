#!/bin/bash
# Reset campaign for fresh testing
cd /opt/dnd/campaigns/test-silverpeak

# Clear conversation history
echo '[]' > conversation-history.json

# Reset combat state while preserving characters/party
cat campaign-state.json | jq '
  .combatMachineState = "IDLE" |
  .combat = {
    "active": false,
    "round": 0,
    "currentTurn": 0,
    "initiativeOrder": [],
    "enemies": [],
    "turnOrder": [],
    "participants": {"players": [], "enemies": []}
  }
' > campaign-state.tmp && mv campaign-state.tmp campaign-state.json

echo "✅ Campaign reset for testing"
echo "   - Conversation history: cleared"
echo "   - Combat state: IDLE"
echo "   - Characters/party: preserved"
echo ""
echo "Restart DND: pm2 restart dnd"
