import { useStore } from "zustand";
import { createCampaignStore, type CampaignSnapshot } from "../stores/campaign-store.ts";
import type { StoredNavigationHistory } from "../stores/session-store.ts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type { SerializedDockview } from "dockview-react";
import type { Value } from "platejs";
import type { Dnd55eStatblock } from "@/lib/statblock-types";

const demoCharacters = ["Carlos Tree", "Niya Jade", "Renot Force"] as const;
export const characters = demoCharacters;

export type CharacterName = typeof demoCharacters[number];

const initialCharacterNotes: Record<CharacterName, Value> = {
  "Carlos Tree": [
    {
      type: "p",
      children: [
        { text: "A patient scout who knows the old forest roads better than anyone in the region." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Keeps a careful eye on strangers, but is " },
        { text: "quick to help", bold: true },
        { text: " people in trouble." },
      ],
    },
  ],
  "Niya Jade": [
    {
      type: "p",
      children: [
        { text: "A well-connected merchant who collects rumors as eagerly as rare curiosities." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Usually calm and polished, though she becomes " },
        { text: "sharp", italic: true },
        { text: " when a deal turns dishonest." },
      ],
    },
  ],
  "Renot Force": [
    {
      type: "p",
      children: [
        { text: "A retired arena champion now looking for a cause worth fighting for." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Loves a dramatic entrance and always keeps his promises." },
      ],
    },
  ],
};

export type NpcImage = { type: "img"; url: string };
export type NpcReference = {
  background: string;
  wants: string;
  ideals: string;
  bond: string;
  flaw: string;
  secrets: string;
  reaction: string;
  personality: string;
  mannerisms: string;
  notableActions: string;
  voice: string;
  allies: string;
  enemies: string;
  other: string;
};
export type NpcPresentation = {
  banner: NpcImage | null;
  portrait: NpcImage | null;
  playerDescription: string;
  gmReference: NpcReference;
  statblock: {
    fieldSetId: string;
    fieldSetVersion: number;
    tokenImage: NpcImage | null;
    data: Dnd55eStatblock;
  };
};
export type Npc = { id: string; name: string; notes: Value; presentation: NpcPresentation };
export type WorkspaceState = {
  layout: SerializedDockview;
  panels: Record<string, SerializedDockview>;
  nextId: number;
  sidebarWidth: number;
  collapsed: boolean;
  history: StoredNavigationHistory;
};
export type Campaign = {
  format: "ttrpg-campaign";
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  npcs: Npc[];
  statblockFieldSet: { id: string; version: number };
  workspace: WorkspaceState | null;
  section: string | null;
  sidebar: { width: number; open: boolean };
};

export function statblockFieldSetLabel(fieldSet: { id: string; version: number }) {
  if (fieldSet.id === "dnd-5.5e" && fieldSet.version === 1) return "D&D 5.5e";
  return `${fieldSet.id} (version ${fieldSet.version})`;
}

export function emptyCampaign(name: string): Campaign {
  const now = new Date().toISOString();
  return { format: "ttrpg-campaign", schemaVersion: 1, id: crypto.randomUUID(), name,
    createdAt: now, updatedAt: now, npcs: [], statblockFieldSet: { id: "dnd-5.5e", version: 1 },
    workspace: null, section: null, sidebar: { width: 256, open: true } };
}

export function createEmptyNpcPresentation(fieldSet = { id: "dnd-5.5e", version: 1 }): NpcPresentation {
  return {
    banner: null,
    portrait: null,
    playerDescription: "",
    gmReference: {
      background: "", wants: "", ideals: "", bond: "", flaw: "", secrets: "", reaction: "",
      personality: "", mannerisms: "", notableActions: "", voice: "", allies: "", enemies: "", other: "",
    },
    statblock: { fieldSetId: fieldSet.id, fieldSetVersion: fieldSet.version, tokenImage: null, data: {} },
  };
}

function demoImage(svg: string): NpcImage {
  return { type: "img", url: `data:image/svg+xml;base64,${btoa(svg)}` };
}

function demoArt({ primary, secondary, accent, hair, skin, initial }: {
  primary: string;
  secondary: string;
  accent: string;
  hair: string;
  skin: string;
  initial: string;
}) {
  const banner = demoImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 220">
    <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient><linearGradient id="fade"><stop stop-color="#101116" stop-opacity=".05"/><stop offset="1" stop-color="#101116" stop-opacity=".65"/></linearGradient></defs>
    <rect width="1400" height="220" fill="url(#sky)"/><circle cx="1040" cy="58" r="46" fill="${accent}" opacity=".65"/>
    <path d="M0 160 140 96l100 60 142-82 132 92 153-105 124 89 148-70 156 86 134-107 171 101v60H0Z" fill="#11151d" opacity=".48"/>
    <path d="M0 185 175 135l135 54 158-68 155 73 156-82 164 75 153-59 130 62 174-75v85H0Z" fill="#101116" opacity=".58"/>
    <rect width="1400" height="220" fill="url(#fade)"/><path d="M0 202h1400" stroke="${accent}" stroke-opacity=".55"/></svg>`);
  const portrait = demoImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
    <defs><linearGradient id="bg" x2=".8" y2="1"><stop stop-color="${secondary}"/><stop offset="1" stop-color="${primary}"/></linearGradient><linearGradient id="coat" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="#151923"/></linearGradient></defs>
    <rect width="480" height="600" fill="url(#bg)"/><circle cx="337" cy="132" r="105" fill="${accent}" opacity=".23"/>
    <path d="M34 600c10-129 61-204 158-224h96c97 20 148 95 158 224Z" fill="url(#coat)"/><path d="M159 389 240 470l81-81 45 26-68 185H182l-68-185Z" fill="#d7d2c4" opacity=".8"/>
    <path d="M139 260c0-105 42-159 105-159s105 54 105 159v71c0 74-50 119-105 119s-105-45-105-119Z" fill="${skin}"/>
    <path d="M125 265c-15-105 27-191 123-191 82 0 132 56 112 188-20-36-42-55-67-72-39 39-99 57-168 59Z" fill="${hair}"/><path d="M146 228c-26 52-20 96-11 133-35-33-47-89-24-141Z" fill="${hair}"/>
    <path d="M185 292h23m64 0h23" stroke="#29252a" stroke-width="8" stroke-linecap="round"/><path d="M214 351q26 20 52 0" fill="none" stroke="#754f4a" stroke-width="6" stroke-linecap="round"/>
    <path d="M176 440 240 501l64-61 31 159H145Z" fill="${secondary}"/><path d="M82 600 153 434l51 49-28 117m222 0-71-166-51 49 28 117" fill="${primary}"/>
    <path d="M39 535c69-35 125-54 201-54s135 19 201 54" fill="none" stroke="${accent}" stroke-width="5" opacity=".8"/></svg>`);
  const token = demoImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <defs><linearGradient id="token" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs>
    <circle cx="128" cy="128" r="119" fill="#171920" stroke="${accent}" stroke-width="8"/><circle cx="128" cy="128" r="99" fill="url(#token)" stroke="#f4e7c2" stroke-opacity=".75" stroke-width="3"/>
    <path d="M128 48 147 101l55 3-43 34 15 53-46-30-46 30 15-53-43-34 55-3Z" fill="${accent}" opacity=".8"/><text x="128" y="151" text-anchor="middle" font-family="serif" font-size="67" font-weight="700" fill="#fff8e8">${initial}</text></svg>`);
  return { banner, portrait, token };
}

function demoPresentation({
  name,
  art,
  playerDescription,
  gmReference,
  statblock,
}: {
  name: CharacterName;
  art: ReturnType<typeof demoArt>;
  playerDescription: string;
  gmReference: NpcReference;
  statblock: Dnd55eStatblock;
}): NpcPresentation {
  return {
    banner: art.banner,
    portrait: art.portrait,
    playerDescription,
    gmReference,
    statblock: {
      fieldSetId: "dnd-5.5e",
      fieldSetVersion: 1,
      tokenImage: art.token,
      data: { name, ...statblock },
    },
  };
}

const demoNpcPresentations: Record<CharacterName, NpcPresentation> = {
  "Carlos Tree": demoPresentation({
    name: "Carlos Tree",
    art: demoArt({ primary: "#284c38", secondary: "#809d64", accent: "#c8d884", hair: "#2b2524", skin: "#c88f70", initial: "C" }),
    playerDescription: "A patient scout who knows the old forest roads better than anyone in the region. Carlos watches strangers carefully, but he is quick to help people in trouble and always seems to know when the woods have gone quiet.",
    gmReference: {
      background: "Carlos grew up among the rangers of Harrow Glen and learned every deer trail, old boundary stone, and safe ford in the wood. He found the ruined watchpost called Mossgate after following a trail of blue sparks. Something beneath it has started waking whenever the moon is new.",
      wants: "Keep Harrow Glen safe without turning the forest into a guarded prison.",
      ideals: "Knowledge is most useful when it is shared with the people who need it.",
      bond: "He owes his life to the old ranger Ilyra Fen, who taught him to read the forest and never leave a companion behind.",
      flaw: "Carlos assumes every unfamiliar sound has a natural explanation, even when the evidence says otherwise.",
      secrets: "He has seen a pale lantern moving through the sealed watchpost. He has not told the villagers because its light matches the one that lured his sister away years ago.",
      reaction: "If a weapon is raised, Carlos steps between the threat and the nearest bystander and asks for one chance to talk.",
      personality: "Patient, watchful, and gently funny once he trusts someone. He makes space for frightened people to speak before offering advice.",
      mannerisms: "Studies footprints while listening; taps two fingers against his bow when thinking; always checks the wind before entering a clearing.",
      notableActions: "Moves a green streak of hair out of his eyes; crouches to inspect even the smallest broken twig; offers the last of his trail rations to others.",
      voice: "Low and calm, with a slight rasp from years of cold dawn patrols. He speaks slowly and rarely raises his voice.",
      allies: "The Harrow Glen wardens, the herbalist Maelin, and a family of charcoal burners on the eastern ridge.",
      enemies: "Poachers led by Vask, and whatever has begun sending lights from Mossgate Watch.",
      other: "Knows the hidden paths through the alder marsh. Will guide the party if they agree to leave the old standing stones undisturbed.",
    },
    statblock: {
      sizeAndType: "Medium humanoid (human)", alignment: "Neutral good", armorClass: "16 (studded leather)",
      hitPoints: "78 (12d8 + 24)", speed: "35 ft.",
      abilityScores: { strength: "12 (+1)", dexterity: "18 (+4)", constitution: "14 (+2)", intelligence: "13 (+1)", wisdom: "17 (+3)", charisma: "11 (+0)" },
      savingThrows: "Dex +7, Wis +6", skills: "Nature +4, Perception +6, Stealth +7, Survival +6",
      damageResistances: "—", senses: "Passive Perception 16", languages: "Common, Elvish", challenge: "5 (1,800 XP)",
      features: {
        traits: [
          { name: "Keen Tracker", description: "Carlos has advantage on Wisdom (Perception) and Wisdom (Survival) checks made in forests. He can follow tracks at a normal pace." },
          { name: "Skirmisher", description: "When a creature ends its turn within 5 feet of Carlos, he can move up to 15 feet without provoking opportunity attacks." },
          { name: "Forest Camouflage", description: "While among natural foliage, Carlos can take the Hide action as a bonus action." },
        ],
        actions: [
          { name: "Multiattack", description: "Carlos makes two attacks, choosing from Longbow or Shortsword." },
          { name: "Longbow", description: "Ranged Weapon Attack: +7 to hit, range 150/600 ft., one target. Hit: 11 (2d6 + 4) piercing damage. If Carlos had advantage on the attack, the target can't take reactions until the start of its next turn." },
          { name: "Shortsword", description: "Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) piercing damage." },
          { name: "Snare Line (Recharge 5–6)", description: "Carlos anchors a cord to a nearby tree and chooses one creature he can see within 30 feet. The target must succeed on a DC 15 Dexterity saving throw or be pulled up to 15 feet and have the Restrained condition until the end of its next turn." },
        ],
        bonusActions: [
          { name: "Cunning Step", description: "Carlos takes the Dash, Disengage, or Hide action." },
          { name: "Mark the Quarry (3/Day)", description: "Carlos marks a creature he can see within 90 feet for 1 minute. The first time each turn he hits the target with a weapon attack, the attack deals an extra 5 (1d10) damage." },
        ],
        reactions: [
          { name: "Covering Shot", description: "When a creature Carlos can see attacks an ally within 30 feet, Carlos imposes disadvantage on the attack roll by firing a warning shot. He must have ammunition and a clear line of sight." },
        ],
      },
    },
  }),
  "Niya Jade": demoPresentation({
    name: "Niya Jade",
    art: demoArt({ primary: "#17645e", secondary: "#7dba9c", accent: "#e4c36a", hair: "#1f2928", skin: "#d5a27e", initial: "N" }),
    playerDescription: "Niya Jade is a well-connected merchant who collects rumors as eagerly as rare curiosities. Her polished manners make every bargain feel friendly, right up until she spots a dishonest offer.",
    gmReference: {
      background: "Niya inherited a modest spice stall and turned it into the Jade Exchange, a discreet courier network that moves letters, favors, and hard-to-find goods across the coast. She keeps a ledger of every debt—not to collect them all, but to know who can be trusted when a crisis arrives.",
      wants: "Find the missing ledger page that names the buyer of the stolen moonstone shipment.",
      ideals: "A fair bargain gives both sides a reason to keep their word.",
      bond: "Her younger brother Arun runs the Exchange while she travels. Niya will abandon any deal to get him out of danger.",
      flaw: "She believes every problem has a price and sometimes mistakes generosity for a negotiation tactic.",
      secrets: "The Jade Exchange helped move the moonstone before Niya knew it was stolen. She suspects the city magistrate arranged the theft to conceal a smuggling route.",
      reaction: "When accused, Niya asks one precise question and listens for the answer that the speaker avoids.",
      personality: "Warm, observant, and composed. She enjoys people who can disagree with her without turning the conversation into a contest.",
      mannerisms: "Turns a jade signet ring when calculating; remembers everyone's preferred tea; writes a short note after every meeting.",
      notableActions: "Straightens a crooked cuff before a difficult conversation; quietly shifts herself between a guest and the nearest exit.",
      voice: "Clear and measured, with a lightly amused lilt. When truly angry, her voice becomes softer rather than louder.",
      allies: "Her brother Arun, dockmaster Pell, and several shopkeepers who rely on the Exchange for safe deliveries.",
      enemies: "The smuggler Veyra Sorn and anyone using the Exchange to traffic people or cursed objects.",
      other: "Can arrange passage, introductions, or a rare mundane item in a day. She expects the party to be candid about risks that could reach her network.",
    },
    statblock: {
      sizeAndType: "Medium humanoid (human)", alignment: "Lawful neutral", armorClass: "15 (warded coat)",
      hitPoints: "96 (15d8 + 30)", speed: "30 ft.",
      abilityScores: { strength: "10 (+0)", dexterity: "16 (+3)", constitution: "14 (+2)", intelligence: "15 (+2)", wisdom: "14 (+2)", charisma: "20 (+5)" },
      savingThrows: "Dex +6, Cha +8", skills: "Deception +8, Insight +5, Persuasion +11, Sleight of Hand +6",
      damageResistances: "Psychic", senses: "Passive Insight 15", languages: "Common, Dwarvish, Halfling", challenge: "7 (2,900 XP)",
      features: {
        traits: [
          { name: "Silver Tongue", description: "Niya has advantage on Charisma checks made to bargain, negotiate, or uncover a creature's terms. A creature that speaks with her for 1 minute must succeed on a DC 16 Wisdom (Insight) check to realize she has redirected the conversation." },
          { name: "Appraising Eye", description: "As a bonus action, Niya studies one creature or object she can see within 30 feet. Until the end of her next turn, she knows whether it is disguised, counterfeit, or under an illusion." },
          { name: "Uncanny Escape", description: "Opportunity attacks against Niya are made with disadvantage." },
        ],
        actions: [
          { name: "Multiattack", description: "Niya makes two Jade Needle attacks." },
          { name: "Jade Needle", description: "Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 7 (1d8 + 3) piercing damage plus 10 (3d6) psychic damage." },
          { name: "Commanding Bargain (Recharge 5–6)", description: "Niya names one creature she can see within 60 feet and offers it a single clear choice. The target must make a DC 16 Wisdom saving throw. On a failure, it uses its reaction to move up to its speed or drop one held item, as Niya chooses." },
          { name: "Smoke of the Exchange (1/Day)", description: "Niya releases a silver-green cloud in a 20-foot-radius sphere centered on a point within 60 feet. The area is heavily obscured until the end of her next turn. Niya and allies she chooses can see normally through the cloud." },
        ],
        bonusActions: [
          { name: "Quick Step", description: "Niya takes the Disengage or Hide action." },
          { name: "Call in a Favor (1/Day)", description: "A courier or shopkeeper Niya trusts creates a brief distraction. One ally within 30 feet can immediately move up to half its speed without provoking opportunity attacks." },
        ],
        reactions: [
          { name: "Not in the Contract", description: "When an attack hits Niya, she adds 3 to her AC against that attack, potentially causing it to miss. If it misses, she can move 10 feet without provoking opportunity attacks." },
        ],
      },
    },
  }),
  "Renot Force": demoPresentation({
    name: "Renot Force",
    art: demoArt({ primary: "#762f37", secondary: "#c58465", accent: "#e7bd68", hair: "#583526", skin: "#bd8062", initial: "R" }),
    playerDescription: "Renot Force is a retired arena champion searching for a cause worth fighting for. He carries himself like the crowd is still watching, but these days he would rather stand between danger and someone who cannot defend themselves.",
    gmReference: {
      background: "Renot spent fifteen years as the undefeated champion of the Brass Ring. He retired after refusing to throw a final match arranged by the arena's owners. The public remembers the victory; Renot remembers the apprentice fighter who was injured in the chaos afterward.",
      wants: "Make amends to the apprentice he failed and find a safer place for the arena's displaced fighters.",
      ideals: "Strength means choosing what deserves protection, especially when no one is cheering.",
      bond: "He still wears the cracked bronze clasp from his first trainer, Odo, who taught him to stop a fight before it became a tragedy.",
      flaw: "Renot accepts blame too readily and will walk into danger alone if he thinks it will spare someone else.",
      secrets: "The arena's owners paid him to win the final match, but also had a second plan to kill the apprentice if Renot lost. He kept the original contract as evidence.",
      reaction: "If an ally within reach is hit, Renot turns the blow aside with his shield and challenges the attacker to face him.",
      personality: "Big-hearted and theatrical, with a surprising gentleness around children and injured animals. He hates bullies more than he enjoys winning.",
      mannerisms: "Rolls his shoulders before a fight; bows to every opponent; asks the quietest person in the room what they think.",
      notableActions: "Calls an opponent 'friend' in the middle of a duel; offers a hand up after knocking someone down; laughs when a plan goes wrong.",
      voice: "A booming arena voice that softens around people who are scared. He occasionally narrates his own dramatic entrances as a joke.",
      allies: "Odo the retired trainer, the Brass Ring apprentices, and a network of former arena healers.",
      enemies: "Arena patron Lord Varric and the pit boss who arranged the apprentice's injury.",
      other: "If the party treats a defeated foe with dignity, Renot's trust rises quickly. If they exploit a helpless enemy, he will challenge them directly.",
    },
    statblock: {
      sizeAndType: "Medium humanoid (human)", alignment: "Chaotic good", armorClass: "19 (half plate, shield)",
      hitPoints: "187 (22d8 + 88)", speed: "30 ft.",
      abilityScores: { strength: "20 (+5)", dexterity: "14 (+2)", constitution: "18 (+4)", intelligence: "11 (+0)", wisdom: "14 (+2)", charisma: "16 (+3)" },
      savingThrows: "Str +9, Con +8, Wis +6", skills: "Athletics +9, Insight +6, Intimidation +7, Performance +7",
      damageResistances: "Bludgeoning, piercing, and slashing from nonmagical attacks", senses: "Passive Perception 12", languages: "Common", challenge: "12 (8,400 XP)",
      features: {
        traits: [
          { name: "Arena Veteran", description: "Renot has advantage on initiative rolls and on ability checks made to avoid being shoved or knocked prone." },
          { name: "Protective Stance", description: "Allies of Renot's choice within 10 feet of him gain a +2 bonus to saving throws against being frightened. Renot can use a bonus action to move up to half his speed toward an ally he can see." },
          { name: "Second Wind (Recharge 5–6)", description: "At the start of his turn, if Renot has 93 hit points or fewer, he regains 20 hit points and can end one condition affecting him." },
          { name: "Indomitable (2/Day)", description: "When Renot fails a saving throw, he can choose to succeed instead." },
        ],
        actions: [
          { name: "Multiattack", description: "Renot makes three attacks with Forceful Maul, or two attacks with Forceful Maul and one Shield Bash." },
          { name: "Forceful Maul", description: "Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 16 (2d10 + 5) bludgeoning damage. If the target is Large or smaller, it must succeed on a DC 17 Strength saving throw or be pushed up to 10 feet." },
          { name: "Shield Bash", description: "Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) bludgeoning damage, and the target must succeed on a DC 17 Strength saving throw or have the Prone condition." },
          { name: "Ring the Bell (Recharge 5–6)", description: "Renot slams his maul into the ground. Each creature of his choice within 15 feet must make a DC 16 Constitution saving throw, taking 27 (6d8) thunder damage on a failed save or half as much on a successful one. On a failed save, a creature also can't take reactions until the end of its next turn." },
        ],
        bonusActions: [
          { name: "Champion's Challenge", description: "Renot challenges one creature he can see within 30 feet. Until the end of Renot's next turn, the target has disadvantage on attack rolls against creatures other than Renot." },
          { name: "Second Wind (1/Day)", description: "Renot regains 22 (1d10 + 17) hit points." },
        ],
        reactions: [
          { name: "Interpose Shield", description: "When a creature Renot can see hits an ally within 5 feet of him, Renot reduces the damage by 15 (2d10 + 4). If this reduces the damage to 0, Renot can shove the attacker 5 feet." },
        ],
        legendaryActions: [
          { name: "Move", description: "Renot moves up to half his speed without provoking opportunity attacks." },
          { name: "Maul (Costs 2 Actions)", description: "Renot makes one Forceful Maul attack." },
          { name: "Rally (Costs 2 Actions)", description: "One ally within 30 feet that can hear Renot can move up to its speed and gains 10 temporary hit points." },
        ],
      },
    },
  }),
};

const demo = emptyCampaign("My campaign");
demo.npcs = demoCharacters.map((name) => ({
  id: crypto.randomUUID(), name, notes: initialCharacterNotes[name],
  presentation: demoNpcPresentations[name],
}));
export const campaignStore = createCampaignStore({ campaign: demo, path: null, revision: 0, savedRevision: 0,
  status: "Choose Save to keep this campaign", error: "", generation: 0, isLeaving: false });
export function useCampaign(): CampaignSnapshot;
export function useCampaign<T>(selector: (state: CampaignSnapshot) => T): T;
export function useCampaign(selector?: (state: CampaignSnapshot) => unknown) {
  return useStore(campaignStore, selector ?? ((state) => state));
}
export function getCampaign() { return campaignStore.getState(); }
export function updateCampaign(change: Partial<Campaign>) {
  campaignStore.setState((state) => ({ campaign: { ...state.campaign, ...change, updatedAt: new Date().toISOString() },
    revision: state.revision + 1, status: "Unsaved changes", error: "" }));
}
export function createNpc(name: string) {
  const state = getCampaign();
  const npc: Npc = {
    id: crypto.randomUUID(), name: name.trim(), notes: [{ type: "p", children: [{ text: "" }] }],
    presentation: createEmptyNpcPresentation(state.campaign.statblockFieldSet),
  };
  updateCampaign({ npcs: [...state.campaign.npcs, npc] });
  return npc.id;
}
export function saveNpcPresentation(id: string, presentation: NpcPresentation) {
  const { campaign } = getCampaign();
  if (!campaign.npcs.some((item) => item.id === id)) return;
  updateCampaign({ npcs: campaign.npcs.map((item) => item.id === id ? { ...item, presentation: structuredClone(presentation) } : item) });
}
export function saveNpcChanges(id: string, changes: Partial<Pick<Npc, "name" | "notes" | "presentation">>) {
  const { campaign } = getCampaign();
  if (!campaign.npcs.some((item) => item.id === id)) return;
  updateCampaign({ npcs: campaign.npcs.map((item) => item.id === id ? { ...item, ...structuredClone(changes) } : item) });
}
export function getCharacterNotes(id: string): Value {
  return getCampaign().campaign.npcs.find((npc) => npc.id === id)?.notes ?? [{ type: "p", children: [{ text: "" }] }];
}
export function saveCharacterNotes(id: string, notes: Value) {
  const { campaign } = getCampaign();
  const npc = campaign.npcs.find((item) => item.id === id);
  if (!npc || JSON.stringify(npc.notes) === JSON.stringify(notes)) return;
  updateCampaign({ npcs: campaign.npcs.map((item) => item.id === id ? { ...item, notes: structuredClone(notes) } : item) });
}

function campaignPackageName(name: string) {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, "-").replace(/\p{Cc}/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "").trim() || "Campaign";
  return safeName.replace(/\.campaign$/i, "") || "Campaign";
}

async function chooseCampaignPackagePath(): Promise<string | null> {
  const packageName = campaignPackageName(getCampaign().campaign.name);
  const selectedPath = await save({
    title: "Save campaign package",
    defaultPath: packageName,
    filters: [{ name: "Campaign package", extensions: ["campaign"] }],
  });
  if (!selectedPath) return null;
  return `${selectedPath.replace(/\.campaign$/i, "")}.campaign`;
}

async function loadCampaignPath(path: string) {
  const campaign = await invoke<Campaign>("open_campaign", { path });
  campaignStore.setState((state) => ({ campaign, path, revision: 0, savedRevision: 0,
    status: "Saved", error: "", generation: state.generation + 1 }));
}

export async function openCampaignAt(path: string): Promise<boolean> {
  // A Finder-opened campaign replaces the untouched sample on cold start without a discard prompt.
  const state = getCampaign();
  if (state.generation === 0 && state.path === null && state.revision === 0) {
    try {
      await loadCampaignPath(path);
      return true;
    } catch (error) {
      campaignStore.setState({ error: String(error) });
      return false;
    }
  }
  return leaveCampaign("switch", async () => {
    await loadCampaignPath(path);
    return true;
  });
}

export async function listenForCampaignOpens() {
  if (!isTauri()) return () => {};
  const opening = new Set<string>();
  const handlePaths = (paths: string[]) => {
    for (const path of paths) {
      if (opening.has(path)) continue;
      opening.add(path);
      void openCampaignAt(path).finally(() => opening.delete(path));
    }
  };
  const unlisten = await listen<string[]>("campaign-open-requested", (event) => handlePaths(event.payload));
  const initialPaths = await invoke<string[]>("take_opened_campaigns");
  handlePaths(initialPaths);
  return unlisten;
}

let saving: Promise<boolean> | null = null;
const queuedSaves = new Set<Promise<boolean>>();
function runCampaignSave(chooseNewPath: boolean, explicit: boolean): Promise<boolean> {
  if (!explicit && getCampaign().isLeaving) return Promise.resolve(false);
  const generation = getCampaign().generation;
  const isCurrentCampaign = () => getCampaign().generation === generation;
  if (saving) {
    if (!chooseNewPath) return saving;
    const queued = saving.then(() => isCurrentCampaign() ? runCampaignSave(true, explicit) : false)
      .finally(() => { queuedSaves.delete(queued); });
    queuedSaves.add(queued);
    return queued;
  }
  saving = (async () => {
    try {
      if (!isTauri()) throw new Error("Use the desktop app (pnpm tauri dev) to save campaign folders.");
      const currentPath = getCampaign().path;
      const path = chooseNewPath || !currentPath ? await chooseCampaignPackagePath() : currentPath;
      if (!path || !isCurrentCampaign()) return false;
      do {
        const { campaign, revision } = getCampaign();
        campaignStore.setState({ status: "Saving…", error: "" });
        await invoke("save_campaign", { path, campaign });
        if (!isCurrentCampaign()) return false;
        campaignStore.setState({ path, savedRevision: revision, status: "Saved" });
      } while (getCampaign().revision !== getCampaign().savedRevision);
      return true;
    } catch (error) {
      if (isCurrentCampaign()) campaignStore.setState({ status: "Save failed — changes kept in memory", error: String(error) });
      return false;
    }
  })().finally(() => { saving = null; });
  return saving;
}
export function saveCampaign(explicit = true): Promise<boolean> {
  return runCampaignSave(false, explicit);
}
export function saveCampaignAs(): Promise<boolean> {
  return runCampaignSave(true, true);
}
export type UnsavedChoice = "save" | "discard" | "cancel";
export type LeaveIntent = "close" | "switch";
let chooseUnsaved: ((intent: LeaveIntent) => Promise<UnsavedChoice>) | null = null;
export function setUnsavedChoiceHandler(handler: (intent: LeaveIntent) => Promise<UnsavedChoice>) {
  chooseUnsaved = handler;
  return () => { if (chooseUnsaved === handler) chooseUnsaved = null; };
}

// Pause autosave for the whole transition, including any native file dialog.
export async function leaveCampaign(intent: LeaveIntent, action: () => Promise<boolean | void>): Promise<boolean> {
  if (getCampaign().isLeaving) return false;
  campaignStore.setState({ isLeaving: true });
  try {
    // Save As requests may be waiting behind the active save. Finish the whole queue
    // before replacing the document or deciding whether it has unsaved changes.
    while (saving || queuedSaves.size) await Promise.all([...(saving ? [saving] : []), ...queuedSaves]);
    const state = getCampaign();
    if (!state.path || state.revision !== state.savedRevision) {
      const choice = chooseUnsaved ? await chooseUnsaved(intent) : "save";
      if (choice === "cancel") return false;
      if (choice === "save" && !await saveCampaign()) return false;
    }
    return await action() !== false;
  } catch (error) {
    campaignStore.setState({ error: String(error) });
    return false;
  } finally {
    campaignStore.setState({ isLeaving: false });
  }
}

export async function replaceCampaign(name?: string) {
  return leaveCampaign("switch", async () => {
    // New campaigns are drafts. Choose a folder only on the first explicit Save.
    if (name !== undefined) {
      if (!name.trim()) return false;
      campaignStore.setState((state) => ({ campaign: emptyCampaign(name.trim()), path: null,
        revision: 1, savedRevision: 0, status: "Unsaved campaign — choose Save to keep it",
        error: "", generation: state.generation + 1 }));
      return true;
    }
    if (!isTauri()) throw new Error("Use the desktop app (pnpm tauri dev) to open campaign files.");
    const isMacOS = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
    const path = isMacOS
      ? await open({ title: "Open campaign package", multiple: false, filters: [{ name: "Campaign Package", extensions: ["campaign"] }] })
      : await open({ title: "Open campaign package", directory: true, multiple: false });
    if (!path) return false;
    await loadCampaignPath(path);
    return true;
  });
}
