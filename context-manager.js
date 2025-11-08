// Story Context Manager for D&D Campaign
// Handles loading complete campaign history and extracting key context

class StoryContextManager {
    constructor() {
        this.fullStoryLog = null;
        this.keyContext = null;
        this.characterProfiles = null;
        this.plotSummary = null;
        this.currentSituation = null;
        this.isLoaded = false;
    }

    async loadCompleteStory() {
        try {
            // Load the complete story log
            const response = await fetch('./dax campaign full log.txt');
            this.fullStoryLog = await response.text();
            
            // Extract key context elements
            this.extractKeyContext();
            this.buildCharacterProfiles();
            this.buildPlotSummary();
            this.extractCurrentSituation();
            
            this.isLoaded = true;
            console.log('📚 Complete story context loaded and processed');
            
        } catch (error) {
            console.error('Failed to load story context:', error);
            // Fallback to basic context if story file unavailable
            this.buildFallbackContext();
            this.isLoaded = true;
        }
    }

    extractKeyContext() {
        if (!this.fullStoryLog) return;

        // Extract critical story elements using pattern matching
        const storyElements = {
            ship_name: this.fullStoryLog.match(/U\.E\.S\.\s+Wanderer/i)?.[0] || "U.E.S. Wanderer",
            current_location: "Titan Station Quarantine",
            time_remaining: "47 hours quarantine remaining",
            conspiracy: "Weyland Biosystems deliberately sold bioweapons disguised as artifacts",
            key_evidence: "Martinez's data log (hidden with Chen)",
            revelation: "Dr. Yuen was the cargo specialist who originally cleared the containers"
        };

        this.keyContext = storyElements;
    }

    buildCharacterProfiles() {
        // Build comprehensive character profiles from story
        this.characterProfiles = {
            dax: {
                name: "Dax Stargazer",
                species: "Vexian (four-armed alien)",
                role: "Tech Specialist/Scout", 
                personality: "Analytical, tech-savvy, cautious survivor",
                background: "Discovered the conspiracy 3 weeks ago, hid memories with Yuen's help",
                current_status: "Main protagonist, suspicious of Yuen, empty sidearm",
                pronouns: "he/him"
            },
            chen: {
                name: "Chen", 
                species: "Human",
                role: "Engineer/Security Specialist",
                personality: "Tough, practical, loyal to crew",
                background: "Ship's engineer, knows about Martinez's data log",
                current_status: "Has Martinez's hidden data log and shotgun (2 shells)",
                pronouns: "she/her",
                critical_note: "FEMALE CHARACTER - consistently referred to as 'she/her' throughout story"
            },
            yuen: {
                name: "Dr. Yuen",
                species: "Human", 
                role: "Ship's Doctor & Cargo Specialist",
                personality: "Knowledgeable but secretive, helped with memory lock",
                background: "Was the cargo specialist who originally cleared the bioweapon containers",
                current_status: "Injured but stable, revealed her true role, knows more than she admits",
                pronouns: "she/her",
                critical_note: "FEMALE CHARACTER - medical officer with hidden cargo specialist background"
            }
        };
    }

    buildPlotSummary() {
        this.plotSummary = {
            chapter_1: "Dax awakens on infected ship U.E.S. Wanderer, escapes with Chen and Dr. Yuen",
            conspiracy: "Weyland Biosystems deliberately sold bioweapons as 'artifacts' to Morrison",
            memory_lock: "Dax discovered conspiracy 3 weeks ago, hid memories as insurance with Yuen's help", 
            escape: "Ship lost, Captain Morrison died maintaining quarantine, three survivors escaped in pods",
            chapter_2: "Arrived at Titan Station, placed in quarantine, uncovered Yuen's cargo specialist role",
            current_tension: "Weyland filing insurance claims blaming crew, survivor benefits negotiations ongoing"
        };
    }

    extractCurrentSituation() {
        this.currentSituation = {
            location: "Titan Station - Section C Quarantine Facility",
            time: "Day 1 of quarantine (47 hours remaining)",
            immediate_concerns: [
                "Official U.E.S. debrief scheduled for tomorrow",
                "Weyland pushing for quick resolution",
                "Need to coordinate stories without revealing full truth",
                "Dr. Yuen knows more than she's admitted",
                "Survivor benefits: 15k credits each (45k total)"
            ],
            party_status: {
                dax: "Rested, suspicious of Yuen, empty gun, no multi-tool",
                chen: "Has shotgun (2 shells) + Martinez's data log (hidden)",
                yuen: "Injured but stable, was cargo specialist(!)"
            },
            npcs: {
                director_holbrook: "Station admin, neutral but suspicious",
                jonathan_park: "Nervous U.E.S. rep on station", 
                kellerman: "Weyland rep (haven't met yet)",
                captain_morrison: "Dead hero, maintained quarantine"
            }
        };
    }

    buildFallbackContext() {
        // Minimal context if story file can't be loaded
        this.keyContext = {
            current_location: "Titan Station Quarantine",
            conspiracy: "Weyland Biosystems bioweapon plot",
            time_remaining: "47 hours quarantine remaining"
        };
        
        this.characterProfiles = {
            dax: { name: "Dax Stargazer", species: "Vexian", role: "Tech Specialist", pronouns: "he/him" },
            chen: { name: "Chen", species: "Human", role: "Engineer", pronouns: "she/her", critical_note: "FEMALE CHARACTER" },
            yuen: { name: "Dr. Yuen", species: "Human", role: "Medical Officer", pronouns: "she/her", critical_note: "FEMALE CHARACTER" }
        };
        
        console.log('⚠️ Using fallback context - story file unavailable');
    }

    buildContextPrompt() {
        if (!this.isLoaded) {
            return "D&D space opera campaign in progress.";
        }

        return `# CAMPAIGN CONTEXT - TITAN STATION CRISIS

## CRITICAL CHARACTER INFO (NEVER CHANGE THESE):
- **Dax Stargazer**: Male Vexian (4-armed alien), Tech Specialist, main protagonist
- **Chen**: FEMALE human engineer, tough personality, has Martinez's data log + shotgun
- **Dr. Yuen**: FEMALE human doctor/cargo specialist, knows more than admits

## STORY SUMMARY:
${this.plotSummary.chapter_1}
${this.plotSummary.conspiracy}
${this.plotSummary.memory_lock}
${this.plotSummary.escape}
${this.plotSummary.chapter_2}

## CURRENT SITUATION:
**Location**: ${this.currentSituation.location}
**Time**: ${this.currentSituation.time}
**Key Tension**: ${this.plotSummary.current_tension}

**Immediate Concerns**: ${this.currentSituation.immediate_concerns.join(', ')}

**Party Status**:
- Dax: ${this.currentSituation.party_status.dax}
- Chen: ${this.currentSituation.party_status.chen}  
- Dr. Yuen: ${this.currentSituation.party_status.yuen}

## IMPORTANT NOTES:
- Maintain perfect character consistency, especially genders
- This is Chapter 2 continuing from established storyline
- Weyland Biosystems is the primary antagonist
- Story tone: Mass Effect meets The Expanse meets Dead Space`;
    }

    getCharacterGender(characterName) {
        const name = characterName.toLowerCase();
        if (this.characterProfiles) {
            for (const [key, profile] of Object.entries(this.characterProfiles)) {
                if (profile.name.toLowerCase().includes(name) || key === name) {
                    return profile.pronouns;
                }
            }
        }
        return null;
    }

    // Get rolling window of recent events for context
    getRecentContext(conversationHistory, maxEntries = 10) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return "Beginning of current session.";
        }

        const recent = conversationHistory.slice(-maxEntries);
        let context = "## RECENT EVENTS:\n";
        
        recent.forEach((entry, index) => {
            const role = entry.type === 'player' ? 'Player' : 'DM';
            context += `${index + 1}. **${role}**: ${entry.message.substring(0, 150)}${entry.message.length > 150 ? '...' : ''}\n`;
        });

        return context;
    }
}

// Export for use in other modules
window.StoryContextManager = StoryContextManager;