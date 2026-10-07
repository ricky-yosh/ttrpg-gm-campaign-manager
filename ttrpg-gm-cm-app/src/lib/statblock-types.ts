export type Dnd55eAbilityScores = Partial<{
  strength: string;
  dexterity: string;
  constitution: string;
  intelligence: string;
  wisdom: string;
  charisma: string;
}>;

export type Dnd55eFeature = {
  name: string;
  description: string;
};

export type Dnd55eFeatureGroup = "traits" | "actions" | "bonusActions" | "reactions" | "legendaryActions";

export type Dnd55eStatblock = {
  name?: string;
  sizeAndType?: string;
  alignment?: string;
  armorClass?: string;
  hitPoints?: string;
  speed?: string;
  abilityScores?: Dnd55eAbilityScores;
  savingThrows?: string;
  skills?: string;
  damageVulnerabilities?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  challenge?: string;
  features?: Partial<Record<Dnd55eFeatureGroup, Dnd55eFeature[]>>;
};
