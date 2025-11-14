export enum GameTemplate {
  PLATFORMER = 'platformer',
  ARCADE = 'arcade',
  PUZZLE = 'puzzle',
  TOWER_DEFENSE = 'towerDefense',
  VERTICAL_STANDARD = 'verticalStandard',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export interface GameVisualSettings {
  colors?: string[];
  style?: string;
  background?: string;
  accentColor?: string;
}

export interface GeneratedGameData {
  title: string;
  description: string;
  mechanics?: Record<string, unknown>;
  visuals?: GameVisualSettings;
  levels?: unknown[];
}

export interface GameConfig {
  template: GameTemplate;
  difficulty: Difficulty;
  params: Record<string, unknown>;
}

export interface GeneratedGame {
  id: string;
  title: string;
  template: GameTemplate;
  difficulty: Difficulty;
  score: number;
  highScore: number;
  rewards: number;
  createdAt: number;
  config: GameConfig;
  gameData?: GeneratedGameData;
}

export interface GameTemplateDefinition {
  id: GameTemplate;
  name: string;
  description: string;
  defaultParams: Record<string, unknown>;
  paramFields: ParamField[];
}

export interface ParamField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  defaultValue: unknown;
  options?: string[];
  min?: number;
  max?: number;
  multiline?: boolean;
}

export interface ScoreSystem {
  currentScore: number;
  highScore: number;
  rewards: number;
  multiplier: number;
}

export type PlatformerObjectiveType = 'collect' | 'score' | 'survive';

export interface PlatformerObjective {
  type: PlatformerObjectiveType;
  description: string;
  targetCount?: number;
  targetScore?: number;
  survivalTime?: number;
  bonusOnComplete?: number;
}

export type PlatformerEnemyBehavior = 'patrol' | 'chaser' | 'hopper';

export interface PlatformerEnemyArchetype {
  id: string;
  name: string;
  description: string;
  behavior: PlatformerEnemyBehavior;
  ability: string;
  speedMultiplier: number;
  jumpStrength: number;
  aggression: number;
  color?: string;
}

export type PlatformerPowerUpEffect = 'speed' | 'shield' | 'scoreBoost';

export interface PlatformerPowerUp {
  id: string;
  name: string;
  effect: PlatformerPowerUpEffect;
  duration: number;
  description: string;
}

export interface PlatformerBonusRules {
  collectibleName: string;
  pointsPerCollectible: number;
  comboName: string;
  comboDecaySeconds: number;
  powerUps?: PlatformerPowerUp[];
}

export type PlatformerHazardStyle = 'static' | 'pulse' | 'slide';

export interface PlatformerHazardPack {
  fallingFrequency: number;
  fallingSpeed: number;
  floorHazardCount: number;
  specialStyle: PlatformerHazardStyle;
  description?: string;
}

export interface PlatformerVariantSettings {
  variantName: string;
  variantDescription?: string;
  palette?: string[];
  objective: PlatformerObjective;
  enemyArchetypes: PlatformerEnemyArchetype[];
  bonusRules: PlatformerBonusRules;
  hazardPack: PlatformerHazardPack;
}

export type ArcadeObjectiveType = 'survive' | 'score';

export interface ArcadeObjective {
  type: ArcadeObjectiveType;
  description: string;
  survivalTime?: number;
  targetScore?: number;
  bonusOnComplete?: number;
}

export type ArcadeEnemyPattern = 'basic' | 'zigzag' | 'tank';

export interface ArcadeEnemyProfile {
  id: string;
  name: string;
  description: string;
  pattern: ArcadeEnemyPattern;
  hp: number;
  speedMultiplier: number;
  fireRateMultiplier: number;
  dropsPowerUpChance: number;
  weapon: ArcadeWeaponProfile;
  ability?: ArcadeEnemyAbility;
}

export type ArcadePowerUpEffect = 'shield' | 'rapid' | 'spread';

export interface ArcadePowerUpProfile {
  id: string;
  name: string;
  effect: ArcadePowerUpEffect;
  duration: number;
  description: string;
  dropChance: number;
}

export interface ArcadeWaveEnemyMix {
  enemyId: string;
  weight: number;
}

export interface ArcadeWaveDefinition {
  id: string;
  name: string;
  description?: string;
  durationSeconds: number;
  spawnRate: number;
  speedMultiplier: number;
  fireRateMultiplier: number;
  enemyMix: ArcadeWaveEnemyMix[];
}

export interface ArcadeVariantSettings {
  codename: string;
  briefing: string;
  comboName: string;
  comboDecaySeconds: number;
  objective: ArcadeObjective;
  waves: ArcadeWaveDefinition[];
  enemyProfiles: ArcadeEnemyProfile[];
  powerUps: ArcadePowerUpProfile[];
}

export type ArcadeWeaponType = 'laser' | 'burst' | 'spread';

export interface ArcadeWeaponProfile {
  type: ArcadeWeaponType;
  projectileSpeed: number;
  cooldownModifier?: number;
  burstCount?: number;
  spreadAngle?: number;
}

export type ArcadeAbilityType = 'dash' | 'shieldPulse' | 'drone';

export interface ArcadeEnemyAbility {
  type: ArcadeAbilityType;
  description: string;
  cooldown: number;
  duration?: number;
  intensity?: number;
}

export type PuzzleBlockPower = 'bomb' | 'lineHorizontal' | 'lineVertical' | 'colorClear' | 'scoreBoost' | 'none';

export interface PuzzleBlockType {
  id: string;
  name: string;
  color: string;
  description?: string;
  power?: PuzzleBlockPower;
  spawnWeight?: number;
  bonusScore?: number;
}

export type PuzzleBonusTriggerType = 'totalMatches' | 'combo' | 'cascade';

export interface PuzzleBonusReward {
  extraMoves?: number;
  score?: number;
  spawnSpecialBlockId?: string;
}

export interface PuzzleBonusRule {
  id: string;
  name: string;
  description: string;
  triggerType: PuzzleBonusTriggerType;
  threshold: number;
  reward: PuzzleBonusReward;
}

export interface PuzzleBoardCell {
  row: number;
  col: number;
}

export interface PuzzleBoardModifier {
  presetName: string;
  description?: string;
  blockedCells?: PuzzleBoardCell[];
}

export interface PuzzleVariantSettings {
  codename: string;
  flavorText: string;
  baseGridSize?: number;
  targetMatchesModifier?: number;
  moveBudgetModifier?: number;
  blockTypes: PuzzleBlockType[];
  bonusRules?: PuzzleBonusRule[];
  boardModifiers?: PuzzleBoardModifier;
}

