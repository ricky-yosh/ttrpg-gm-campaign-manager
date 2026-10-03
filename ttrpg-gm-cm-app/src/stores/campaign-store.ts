import { createStore } from "zustand/vanilla";
import type { Campaign } from "../lib/campaign-data.ts";

export type CampaignSnapshot = {
  campaign: Campaign;
  path: string | null;
  revision: number;
  savedRevision: number;
  status: string;
  error: string;
  generation: number;
  isLeaving: boolean;
};

// The save service owns promises and native resources; only observable data lives here.
export function createCampaignStore(initialSnapshot: CampaignSnapshot) {
  return createStore<CampaignSnapshot>()(() => initialSnapshot);
}
