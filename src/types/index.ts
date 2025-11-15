export enum GameTemplate {
  PLATFORMER = 'platformer',
  ARCADE = 'arcade',
  PUZZLE = 'puzzle',
  TOWER_DEFENSE = 'towerDefense',
  VERTICAL_STANDARD = 'verticalStandard',
  ROGUELIKE = 'roguelike',
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

export type GlobalMutatorType =
  | 'scoreMultiplier'
  | 'timeScale'
  | 'oneHitDeath'
  | 'invertHorizontalControls';

export interface GlobalMutator {
  id: string;
  name: string;
  description: string;
  type: GlobalMutatorType;
  /**
   * Интенсивность эффекта:
   * - для scoreMultiplier — множитель очков (например 1.5, 2, 3)
   * - для timeScale — множитель темпа/скорости (0.7–1.8)
   * - для oneHitDeath / invertHorizontalControls — >0.5 означает «включено»
   */
  intensity?: number;
}

export type GamePace = 'slow' | 'normal' | 'fast';

export interface GameVariationProfile {
  codename: string;
  /**
   * Краткое настроение варианта, свободная строка (например "chaotic", "tactical", "dreamy")
   */
  mood?: string;
  pace?: GamePace;
  /**
   * Обобщённый риск (0–1). 0 — безопасно, 1 — очень рискованно.
   */
  risk?: number;
  /**
   * Набор глобальных мутаторов, которые движок будет применять
   * поверх конкретной игровой логики шаблонов.
   */
  mutators?: GlobalMutator[];
}

export type SpriteRole =
  | 'hero'
  | 'enemy'
  | 'boss'
  | 'bonus'
  | 'projectile'
  | 'effect'
  | 'environment'
  | 'ui';

export type SpriteAnimationType = 'idle' | 'move' | 'attack' | 'cast' | 'hit' | 'death' | 'effect' | 'spawn';

export interface SpriteAnimationCue {
  id: string;
  name: string;
  type: SpriteAnimationType;
  frames: number;
  frameDurationMs: number;
  loop: boolean;
  description: string;
}

export interface SpritePlanEntry {
  id: string;
  role: SpriteRole;
  name: string;
  description: string;
  palette: string[];
  size: number;
  usage: string;
  requiresAnimation: boolean;
  animations: SpriteAnimationCue[];
  fxNotes?: string;
}

export interface SpriteStyleGuide {
  artDirection: string;
  palette: string[];
  lighting: string;
  shading: string;
  strokeStyle: string;
  background?: string;
  textureNotes?: string;
}

export interface SpriteAsset {
  meta: SpritePlanEntry;
  svg: string;
  viewBox: string;
}

export interface SpriteAssetPack {
  styleGuide: SpriteStyleGuide;
  spritePlan: SpritePlanEntry[];
  spriteSheets: SpriteAsset[];
  animationNotes: string[];
}

export interface GeneratedGameAssets {
  artPipeline: 'llm-svg-16bit';
  generatedAt: string;
  spriteKit: SpriteAssetPack;
}

export interface GeneratedGameData {
  title: string;
  description: string;
  mechanics?: Record<string, unknown>;
  visuals?: GameVisualSettings;
  levels?: unknown[];
  /**
   * Генеративный «геном» игры — общие вариации правил,
   * применимые во всех шаблонах (скорость, риск, мутаторы и т.п.).
   * Обычно дублируется внутри mechanics.gameVariation.
   */
  variationProfile?: GameVariationProfile;
  assets?: GeneratedGameAssets;
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
  playerWeapons: PlayerWeaponProfile[];
  heroHulls: HeroHullProfile[];
  defaultWeaponId?: string;
  defaultHullId?: string;
}

export type ArcadeWeaponType = 'laser' | 'burst' | 'spread';

export interface ArcadeWeaponProfile {
  type: ArcadeWeaponType;
  projectileSpeed: number;
  cooldownModifier?: number;
  burstCount?: number;
  spreadAngle?: number;
}

export type PlayerWeaponType = 'standard' | 'rapid' | 'spread' | 'burst' | 'piercing' | 'homing';

export interface PlayerWeaponProfile {
  id: string;
  name: string;
  description: string;
  type: PlayerWeaponType;
  projectileSpeed: number;
  cooldown: number;
  damage: number;
  spreadAngle?: number;
  burstCount?: number;
  projectileCount?: number;
}

export type HeroHullType = 'light' | 'medium' | 'heavy' | 'agile' | 'tank';

export interface HeroHullProfile {
  id: string;
  name: string;
  description: string;
  type: HeroHullType;
  healthModifier: number;
  speedModifier: number;
  sizeModifier: number;
  specialAbility?: string;
}

export type ArcadeAbilityType = 'dash' | 'shieldPulse' | 'drone';

export interface ArcadeEnemyAbility {
  type: ArcadeAbilityType;
  description: string;
  cooldown: number;
  duration?: number;
  intensity?: number;
}

// Roguelike (auto-battler / survivor-like) types

export type RoguelikeChallengeGoalType =
  | 'surviveTime'
  | 'reachKillCount'
  | 'collectResources'
  | 'surviveWaves';

export interface RoguelikeChallengeGoal {
  type: RoguelikeChallengeGoalType;
  description: string;
  targetValue: number;
  softFailAllowed?: boolean;
}

export interface RoguelikePlayerConstraint {
  id: string;
  name: string;
  description: string;
  /**
   * Ограничения/бафы игрока, которые LLM может крутить:
   * - maxHealthMultiplier: множитель максимального здоровья (0.3–2.5)
   * - moveSpeedMultiplier: множитель скорости передвижения (0.3–2.0)
   * - attackCooldownMultiplier: множитель перезарядки автоатаки (0.3–2.5)
   * - projectileCountBonus: дополнительные снаряды (+/-)
   * - damageMultiplier: множитель урона (0.3–3.0)
   */
  maxHealthMultiplier?: number;
  moveSpeedMultiplier?: number;
  attackCooldownMultiplier?: number;
  projectileCountBonus?: number;
  damageMultiplier?: number;
  /**
   * Флаги для «жёстких» челленджей: без оружия, только ауры, только яды и т.п.
   */
  weaponDisabled?: boolean;
  allowOnlyMelee?: boolean;
  allowOnlyAuras?: boolean;
}

export type RoguelikeEnemyPattern = 'chaser' | 'orbiter' | 'charger' | 'ranged';

export interface RoguelikeEnemyProfile {
  id: string;
  name: string;
  description: string;
  pattern: RoguelikeEnemyPattern;
  maxHealth: number;
  touchDamage: number;
  speed: number;
  spawnWeight: number;
}

export type RoguelikePickupType =
  | 'heal'
  | 'xp'
  | 'temporaryBuff'
  | 'currency'
  | 'weaponUpgrade';

export interface RoguelikePickupProfile {
  id: string;
  name: string;
  description: string;
  type: RoguelikePickupType;
  amount?: number;
  dropChance: number;
  /**
   * Для pickup.type === 'weaponUpgrade' можно задать конкретный тип улучшения.
   * Если поля не указаны, сцена применит базовое улучшение (чуть больше урона и снарядов).
   */
  upgradeKind?: 'damage' | 'projectile' | 'cooldown' | 'grantWeapon';
  damageBonus?: number;
  projectileBonus?: number;
  cooldownMultiplier?: number;
  grantWeaponId?: string;
  /**
   * Флаг редкой награды — такие объекты должны визуально выделяться.
   */
  rare?: boolean;
  /**
   * Бафы героя, которые могут приходить из LLM (обычно для temporaryBuff):
   * - moveSpeedBonusMultiplier: множитель скорости передвижения (например 1.2 для +20%),
   * - maxHealthBonusFlat: добавочное здоровье (например +1 или +2),
   * - maxHealthBonusMultiplier: множитель максимального здоровья (например 1.3 для +30%).
   */
  moveSpeedBonusMultiplier?: number;
  maxHealthBonusFlat?: number;
  maxHealthBonusMultiplier?: number;
}

export interface RoguelikeWeaponProfile {
  id: string;
  name: string;
  description: string;
  /**
   * basic — простые пули / снаряды вокруг героя,
   * orbit — вращающиеся орбитальные снаряды,
   * nova — периодические круговые волны,
   * chain — цепные молнии/удары по нескольким целям.
   */
  kind: 'basic' | 'orbit' | 'nova' | 'chain';
  baseDamage: number;
  baseCooldownMs: number;
  projectileCount: number;
  range: number;
  /**
   * Необязательные параметры для тонкой настройки оружия.
   */
  projectileSpeed?: number;
  chainTargets?: number;
}

export interface RoguelikeVariantSettings {
  codename: string;
  briefing: string;
  /**
   * Цель раунда — LLM может генерировать выживание, убийства, сбор ресурсов и т.д.
   */
  challengeGoal: RoguelikeChallengeGoal;
  /**
   * Набор ограничений/бафов на игрока для челленджей.
   */
  playerConstraints: RoguelikePlayerConstraint[];
  /**
   * Набор врагов, которые используются для спауна.
   */
  enemyProfiles: RoguelikeEnemyProfile[];
  /**
   * Профили лута/подборов (исцеление, опыт, временные бафы).
   */
  pickupProfiles: RoguelikePickupProfile[];
  /**
   * Список потенциальных оружий героя. В этом шаблоне игрок НЕ стреляет сам —
   * атаки всегда автоматические.
   */
  weapons: RoguelikeWeaponProfile[];
  /**
   * id оружия по умолчанию из массива weapons.
   */
  defaultWeaponId?: string;
  /**
   * Базовая длительность забега (секунды) при цели "surviveTime".
   */
  baseDurationSeconds?: number;
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

