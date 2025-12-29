"""
Dax Stargazer D&D Campaign - Python API Client
Simple Python integration for Claude API with full context
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional
import requests

class DaxCampaignDM:
    """D&D Campaign manager with Claude API integration"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get('CLAUDE_API_KEY')
        self.api_url = "https://api.anthropic.com/v1/messages"
        self.conversation_history = []
        self.campaign_state = self._load_campaign_state()
        
    def _load_campaign_state(self) -> Dict:
        """Load the current campaign state"""
        try:
            with open('campaign-state.json', 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return self._default_campaign_state()
    
    def _default_campaign_state(self) -> Dict:
        """Default campaign state if file not found"""
        return {
            "current_location": "Titan Station secure quarters",
            "current_time": "0300 hours",
            "immediate_threat": "Osprey extraction team hunting party",
            "party": {
                "dax": {"hp": 9, "max_hp": 9, "class": "Vexian Tech-Scout"},
                "chen": {"gender": "female", "role": "engineer", "has": "Martinez's data log"},
                "yuen": {"gender": "female", "role": "doctor", "knows": "memory lock secret"}
            }
        }
    
    def _build_system_prompt(self) -> str:
        """Build the complete system prompt with all context"""
        return f"""You are the Dungeon Master for an ongoing D&D campaign set in a space opera universe.

CRITICAL CHARACTER FACTS (NEVER CHANGE):
- Dax Stargazer: Male Vexian (4-armed alien), Tech-Scout, INT 16, DEX 18
- Chen: FEMALE human engineer, impulsive, has Martinez's data log
- Dr. Yuen: FEMALE human doctor, overthinks, created Dax's memory lock

STORY CONTEXT:
The party escaped the infected ship U.E.S. Wanderer after discovering Weyland Biosystems deliberately shipped bioweapons disguised as archaeological specimens. Captain Morrison died maintaining quarantine. Now on Titan Station, they face:

CURRENT SITUATION:
Location: {self.campaign_state.get('current_location', 'Titan Station')}
Time: {self.campaign_state.get('current_time', 'Unknown')}
Immediate Threat: {self.campaign_state.get('immediate_threat', 'Osprey operatives')}

The party has evidence proving Weyland's conspiracy but professional killers (Osprey Security Solutions) are hunting them. They have a legal meeting in 3 hours that could end their careers or expose the truth.

EVIDENCE THEY POSSESS:
1. Martinez's encrypted data log with shipping manifests
2. Kellerman's recorded admission about "proprietary biological data"
3. Medical proof of Dax's memory lock (showing premeditation)

DM STYLE:
- Political intrigue and investigation over pure combat
- Technical problem-solving using Dax's 4 arms and high INT
- Maintain tension with corporate conspiracy themes
- Reference past events (Wanderer incident, Morrison's sacrifice)
- Death means character switch, not game over

Recent conversation context:
{self._get_recent_context()}

Remember: Chen and Yuen are ALWAYS female. Dax ALWAYS has 4 arms."""
    
    def _get_recent_context(self) -> str:
        """Get the last few exchanges for context"""
        if not self.conversation_history:
            return "No previous exchanges in this session."
        
        recent = self.conversation_history[-10:]  # Last 5 exchanges
        context = []
        for exchange in recent:
            context.append(f"Player: {exchange['player']}")
            context.append(f"DM: {exchange['dm'][:200]}...")  # Truncate long responses
        return "\n".join(context)
    
    def roll_dice(self, dice_string: str) -> Dict:
        """Roll dice (e.g., '1d20+4' or '2d6')"""
        import random
        
        parts = dice_string.lower().replace(' ', '').split('+')
        base = parts[0]
        modifier = int(parts[1]) if len(parts) > 1 else 0
        
        if 'd' in base:
            num_dice, die_size = base.split('d')
            num_dice = int(num_dice) if num_dice else 1
            die_size = int(die_size)
            
            rolls = [random.randint(1, die_size) for _ in range(num_dice)]
            total = sum(rolls) + modifier
            
            return {
                "rolls": rolls,
                "modifier": modifier,
                "total": total,
                "critical": any(r == die_size for r in rolls),
                "fumble": any(r == 1 for r in rolls) and die_size == 20
            }
        return {"error": "Invalid dice string"}
    
    def process_action(self, player_action: str, use_api: bool = True) -> str:
        """Process a player action through Claude API or fallback"""
        
        # Check for dice rolls in the action
        if 'roll' in player_action.lower():
            # Extract dice notation (simple regex)
            import re
            dice_match = re.search(r'\b(\d*d\d+(?:\+\d+)?)\b', player_action)
            if dice_match:
                roll_result = self.roll_dice(dice_match.group(1))
                player_action += f"\n[DICE RESULT: {roll_result}]"
        
        if use_api and self.api_key:
            return self._claude_api_call(player_action)
        else:
            return self._fallback_response(player_action)
    
    def _claude_api_call(self, player_action: str) -> str:
        """Make actual API call to Claude"""
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        data = {
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 2000,
            "temperature": 0.7,
            "system": self._build_system_prompt(),
            "messages": [
                {"role": "user", "content": player_action}
            ]
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, json=data)
            response.raise_for_status()
            result = response.json()
            dm_response = result['content'][0]['text']
            
            # Save to history
            self.conversation_history.append({
                "timestamp": datetime.now().isoformat(),
                "player": player_action,
                "dm": dm_response
            })
            
            return dm_response
            
        except Exception as e:
            return f"API Error: {str(e)}\n\n{self._fallback_response(player_action)}"
    
    def _fallback_response(self, player_action: str) -> str:
        """Context-aware fallback when API is unavailable"""
        action_lower = player_action.lower()
        
        # Maintain character genders in responses
        if 'chen' in action_lower:
            return "Chen looks up from her datapad, her expression serious. The engineer's fingers tap nervously - she's clearly thinking about the Osprey operative still at large. 'We need to move carefully,' she says. 'These aren't street thugs, they're professionals.'"
        
        if 'yuen' in action_lower:
            return "Dr. Yuen adjusts her position, wincing slightly from her injuries. She's been overthinking every angle since learning about the Osprey threat. 'The medical evidence about your memory lock,' she says quietly, 'might be our strongest card if we play it right.'"
        
        if 'osprey' in action_lower or 'operative' in action_lower:
            return "The hidden Osprey operative is still out there. Station security found sophisticated surveillance equipment, but extraction specialists don't just watch - they act. With less than 3 hours until the legal meeting, time is running out. Torres's teams are sweeping the station, but these mercenaries are ghosts when they want to be."
        
        if 'legal' in action_lower or 'meeting' in action_lower:
            return "The legal meeting at 0600 approaches rapidly - less than 3 hours now. Your appointed advocate will need every piece of evidence to counter Weyland's resources. The charges they're threatening - biological warfare - carry life sentences. But with Martinez's data log and Kellerman's recorded admission, you have ammunition of your own."
        
        # Default response maintaining context
        return f"The secure quarters feel safer than your previous location, but you know it's temporary. The station's core hums with activity even at 0300 hours. Your party needs to decide their next move carefully - the Osprey operative is still hunting, and the legal meeting looms."
    
    def save_session(self, filename: str = "session_history.json"):
        """Save the current session for later review"""
        session_data = {
            "campaign_state": self.campaign_state,
            "conversation_history": self.conversation_history,
            "session_date": datetime.now().isoformat()
        }
        
        with open(filename, 'w') as f:
            json.dump(session_data, f, indent=2)
        
        print(f"Session saved to {filename}")
    
    def update_state(self, updates: Dict):
        """Update campaign state (location, time, etc.)"""
        self.campaign_state.update(updates)
        with open('campaign-state.json', 'w') as f:
            json.dump(self.campaign_state, f, indent=2)


# Example usage
if __name__ == "__main__":
    # Initialize the DM (will use CLAUDE_API_KEY env variable if set)
    dm = DaxCampaignDM()
    
    print("=" * 60)
    print("DAX STARGAZER D&D CAMPAIGN - PYTHON CLIENT")
    print("=" * 60)
    print("\nCurrent Situation:")
    print(f"Location: {dm.campaign_state.get('current_location')}")
    print(f"Time: {dm.campaign_state.get('current_time')}")
    print(f"Threat: {dm.campaign_state.get('immediate_threat')}")
    print("\nType 'quit' to exit, 'save' to save session")
    print("Include dice notation (like '1d20+4') for automatic rolls")
    print("=" * 60)
    
    while True:
        print("\n> ", end="")
        player_input = input().strip()
        
        if player_input.lower() == 'quit':
            break
        elif player_input.lower() == 'save':
            dm.save_session()
            continue
        elif not player_input:
            continue
        
        # Process the action (uses API if key is available)
        response = dm.process_action(player_input, use_api=True)
        print(f"\nDM: {response}")
    
    # Auto-save on exit
    dm.save_session()
    print("\nThanks for playing! Session saved.")
