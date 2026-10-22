import { resetSessionNotes } from "../stores/session-notes-store.ts";
import { campaignStore, sampleCampaignId } from "./campaign-data.ts";
import { hydrateSession, useSessionStore } from "../stores/session-store.ts";

// Hydrate synchronously on replacement so old views cannot publish into the next session.
const initial = campaignStore.getState();
resetSessionNotes(initial.campaign.id === sampleCampaignId, initial.campaign);
hydrateSession(initial.campaign, initial.generation);
const unsubscribe = campaignStore.subscribe((state, previous) => {
  if (state.generation !== previous.generation) {
    resetSessionNotes(state.campaign.id === sampleCampaignId, state.campaign);
    hydrateSession(state.campaign, state.generation);
  } else {
    if (state.campaign.maps !== previous.campaign.maps) useSessionStore.getState().setMapIds((state.campaign.maps ?? []).map((map) => map.id));
    if (state.campaign.factions !== previous.campaign.factions) useSessionStore.getState().setFactionIds((state.campaign.factions ?? []).map((faction) => faction.id));
    if (state.campaign.locations !== previous.campaign.locations) useSessionStore.getState().setLocationIds((state.campaign.locations ?? []).map((location) => location.id));
    if (state.campaign.npcs !== previous.campaign.npcs) {
      useSessionStore.getState().setCharacterIds(state.campaign.npcs.map((npc) => npc.id));
    }
  }
});

if (import.meta.hot) import.meta.hot.dispose(unsubscribe);
