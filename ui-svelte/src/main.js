import { mount } from 'svelte';
import CampaignManager from './lib/components/CampaignManager.svelte';
import EquipmentManager from './lib/components/EquipmentManager.svelte';
import RecentRolls from './lib/components/RecentRolls.svelte';
import CampaignNotes from './lib/components/CampaignNotes.svelte';
import GameArea from './lib/components/GameArea.svelte';
import SceneGenerator from './lib/components/SceneGenerator.svelte';
import HeaderControls from './lib/components/HeaderControls.svelte';
import CombatTracker from './lib/components/CombatTracker.svelte';

let characterApp;
let equipmentApp;
let rollsApp;
let notesApp;
let gameAreaApp;
let sceneGenApp;
let headerControlsApp;
let combatTrackerApp;

function initApps() {
  const campaign = 'test-silverpeak';

  // Mount character panel (left side) - includes PartyCredits internally
  const characterTarget = document.getElementById('svelte-character-panel');
  if (characterTarget) {
    console.log('Mounting Character Manager to #svelte-character-panel');
    characterTarget.innerHTML = '';
    characterApp = mount(CampaignManager, {
      target: characterTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #svelte-character-panel not found');
  }

  // Mount equipment manager (right side)
  const equipmentTarget = document.getElementById('equipment-app');
  if (equipmentTarget) {
    console.log('Mounting Equipment Manager to #equipment-app');
    equipmentTarget.innerHTML = '';
    equipmentApp = mount(EquipmentManager, {
      target: equipmentTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #equipment-app not found');
  }

  // Mount recent rolls (right side)
  const rollsTarget = document.getElementById('recent-rolls-app');
  if (rollsTarget) {
    console.log('Mounting Recent Rolls to #recent-rolls-app');
    rollsTarget.innerHTML = '';
    rollsApp = mount(RecentRolls, {
      target: rollsTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #recent-rolls-app not found');
  }

  // Mount campaign notes (right side)
  const notesTarget = document.getElementById('campaign-notes-app');
  if (notesTarget) {
    console.log('Mounting Campaign Notes to #campaign-notes-app');
    notesTarget.innerHTML = '';
    notesApp = mount(CampaignNotes, {
      target: notesTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #campaign-notes-app not found');
  }

  // Mount game area (center - replaces legacy log/input)
  const gameAreaTarget = document.getElementById('game-area-app');
  if (gameAreaTarget) {
    console.log('Mounting Game Area to #game-area-app');
    gameAreaTarget.innerHTML = '';
    gameAreaApp = mount(GameArea, {
      target: gameAreaTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #game-area-app not found');
  }

  // Mount scene generator (right side - top)
  const sceneGenTarget = document.getElementById('scene-generator-app');
  if (sceneGenTarget) {
    console.log('Mounting Scene Generator to #scene-generator-app');
    sceneGenTarget.innerHTML = '';
    sceneGenApp = mount(SceneGenerator, {
      target: sceneGenTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #scene-generator-app not found');
  }

  // Mount header controls (replace legacy buttons)
  const headerControlsTarget = document.getElementById('header-controls-app');
  if (headerControlsTarget) {
    console.log('Mounting Header Controls to #header-controls-app');
    headerControlsTarget.innerHTML = '';
    headerControlsApp = mount(HeaderControls, {
      target: headerControlsTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #header-controls-app not found');
  }

  // Mount combat tracker
  const combatTrackerTarget = document.getElementById('combat-tracker-app');
  if (combatTrackerTarget) {
    console.log('Mounting Combat Tracker to #combat-tracker-app');
    combatTrackerTarget.innerHTML = '';
    combatTrackerApp = mount(CombatTracker, {
      target: combatTrackerTarget,
      props: { campaign }
    });
  } else {
    console.error('Mount point #combat-tracker-app not found');
  }

  // Listen for combat mode changes
  window.addEventListener('combatModeChange', (event) => {
    const { active } = event.detail;
    console.log(`⚔️  Combat mode ${active ? 'ACTIVATED' : 'DEACTIVATED'}`);

    if (active) {
      document.body.classList.add('combat-mode');
    } else {
      document.body.classList.remove('combat-mode');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApps);
} else {
  initApps();
}

export default { characterApp, equipmentApp, rollsApp, notesApp, gameAreaApp, sceneGenApp, headerControlsApp };
