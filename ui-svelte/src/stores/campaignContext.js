/**
 * Campaign Context Store
 * Provides campaign ID to all components without prop drilling
 */
import { getContext, setContext } from 'svelte';
import { writable } from 'svelte/store';

const CAMPAIGN_CONTEXT_KEY = 'campaign';

/**
 * Get campaign ID from URL params
 */
function getCampaignFromURL() {
    if (typeof window === 'undefined') return 'default';
    const params = new URLSearchParams(window.location.search);
    return params.get('campaign') || 'default';
}

/**
 * Create and set the campaign context (call in root component)
 */
export function initCampaignContext(campaignId = null) {
    const campaign = campaignId || getCampaignFromURL();
    const store = writable(campaign);
    setContext(CAMPAIGN_CONTEXT_KEY, store);
    return store;
}

/**
 * Get the campaign context (call in child components)
 * Returns a readable store with the campaign ID
 */
export function getCampaignContext() {
    const ctx = getContext(CAMPAIGN_CONTEXT_KEY);
    if (!ctx) {
        // Fallback for components used outside context
        console.warn('Campaign context not found, using URL param fallback');
        return writable(getCampaignFromURL());
    }
    return ctx;
}

/**
 * Get campaign ID directly (non-reactive)
 */
export function getCampaignId() {
    return getCampaignFromURL();
}
