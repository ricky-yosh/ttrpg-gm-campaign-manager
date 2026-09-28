import type { Value } from "platejs";

export const characters = ["Carlos Tree", "Niya Jade", "Renot Force"] as const;

export type CharacterName = typeof characters[number];

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

const characterDrafts = new Map<CharacterName, Value>();

export function getCharacterNotes(name: string): Value {
  const characterName = characters.find((character) => character === name);
  if (!characterName) return [{ type: "p", children: [{ text: "" }] }];

  return characterDrafts.get(characterName) ?? initialCharacterNotes[characterName];
}

export function saveCharacterNotes(name: string, value: Value) {
  const characterName = characters.find((character) => character === name);
  if (characterName) characterDrafts.set(characterName, value);
}
