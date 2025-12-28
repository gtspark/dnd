/**
 * Compatibility layer - re-exports from apiService
 * This file exists so existing imports from geminiService.ts continue to work
 */

export { initChat, sendMessageToDM } from './apiService';
export {
  loadCampaign,
  submitRoll,
  submitInitiative,
  getCombatState,
  nextTurn,
  endCombat,
  getHistory,
  transformCharacters,
  transformCombatState,
  distributeLoot,
  skipLoot
} from './apiService';

export { default } from './apiService';
