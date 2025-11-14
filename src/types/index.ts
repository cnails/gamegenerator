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
}

export interface ScoreSystem {
  currentScore: number;
  highScore: number;
  rewards: number;
  multiplier: number;
}

