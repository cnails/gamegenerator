import { VerticalBaseScene } from './VerticalStandardScene';
import Phaser from 'phaser';
import type {
  GeneratedGameData,
  PuzzleBlockType,
  PuzzleBonusReward,
  PuzzleBonusRule,
  PuzzleBonusTriggerType,
  PuzzleBoardModifier,
  PuzzleBlockPower,
  PuzzleVariantSettings,
} from '@/types';

interface PuzzleBlock {
  sprite: Phaser.GameObjects.Rectangle;
  color: number;
  row: number;
  col: number;
  typeId: string;
  power?: PuzzleBlockPower;
  bonusScore: number;
}

interface MatchScanResult {
  mask: boolean[][];
  groups: number;
}

interface VariantMeta {
  codename: string;
  flavorText: string;
  baseGridSize?: number;
  targetMatchesModifier?: number;
  moveBudgetModifier?: number;
}

interface NormalizedBlockType {
  id: string;
  name: string;
  color: number;
  spawnWeight: number;
  power?: PuzzleBlockPower;
  bonusScore: number;
}

export class PuzzleScene extends VerticalBaseScene {
  private grid: (PuzzleBlock | null)[][] = [];
  private gridSize: number = 6;
  private blockSize: number = 0;
  private cellGap: number = 6;

  private layoutStartX: number = 0;
  private layoutStartY: number = 0;

  private selectedBlock: PuzzleBlock | null = null;
  private matches: number = 0;
  private targetMatches: number = 12;
  private movesLeft: number = 20;
  private comboMultiplier: number = 1;
  private actionLocked: boolean = false;

  private readonly baseColors: number[] = [0xff5f6d, 0xffc371, 0x1dd1a1, 0x54a0ff, 0x9b59b6];
  private colors: number[] = [...this.baseColors];
  private variantMeta: VariantMeta = {
    codename: 'Crystal Charge',
    flavorText: 'Собери цепочки и зарядись энергией артефакта!',
  };
  private normalizedBlockTypes: NormalizedBlockType[] = [];
  private totalSpawnWeight: number = 0;
  private blockTypeMap: Map<string, NormalizedBlockType> = new Map();
  private bonusRules: PuzzleBonusRule[] = [];
  private triggeredBonuses: Set<string> = new Set();
  private boardModifiersRaw?: PuzzleBoardModifier;
  private blockedCells: Set<string> = new Set();
  private boardDecorations: Phaser.GameObjects.Rectangle[] = [];
  private bonusMessage: string = '';
  private bonusMessageTimer?: Phaser.Time.TimerEvent;

  private instructionText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private moveText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private progressBarBg!: Phaser.GameObjects.Rectangle;
  private progressBarFill!: Phaser.GameObjects.Rectangle;
  private progressBarWidth: number = 0;

  initGame(): void {
    const params = this.gameData?.config?.params ?? {};
    this.loadVariantSettings();
    this.initVerticalLayout({
      minSafeWidth: 360,
      maxSafeWidth: 520,
      paddingX: 0.05,
      paddingY: 0.04,
    });

    const requestedGrid = Number(params.gridSize);
    if (Number.isFinite(requestedGrid) && requestedGrid > 0) {
      this.gridSize = Phaser.Math.Clamp(Math.round(requestedGrid), 4, 9);
    } else if (this.variantMeta.baseGridSize) {
      this.gridSize = Phaser.Math.Clamp(Math.round(this.variantMeta.baseGridSize), 4, 9);
    } else {
      this.gridSize = 6;
    }

    let computedTarget = Number(params.targetMatches);
    if (!Number.isFinite(computedTarget) || computedTarget <= 0) {
      computedTarget = Math.max(14, this.gridSize * 2);
    }
    if (this.variantMeta.targetMatchesModifier) {
      computedTarget = Math.round(computedTarget * this.variantMeta.targetMatchesModifier);
    }
    this.targetMatches = Math.max(6, computedTarget);

    let computedMoves = Number(params.moves);
    if (!Number.isFinite(computedMoves) || computedMoves <= 0) {
      computedMoves = Math.max(16, this.gridSize * 2 + 2);
    }
    if (this.variantMeta.moveBudgetModifier) {
      computedMoves = Math.round(computedMoves * this.variantMeta.moveBudgetModifier);
    }
    // Глобальный темп влияет на «плотность» головоломки: быстрый темп — меньше ходов, медленный — больше.
    const timeScale = this.getGlobalTimeScale(1);
    const tempoFactor = timeScale >= 1 ? timeScale : 1 / timeScale;
    const adjustedMoves =
      timeScale > 1 ? computedMoves / tempoFactor : computedMoves * tempoFactor;
    this.movesLeft = Math.max(6, Math.round(adjustedMoves));
    this.cellGap = Phaser.Math.Clamp((params.cellGap as number) || 6, 2, 14);

    const paletteFromBlocks = this.normalizedBlockTypes.map((type) => type.color);
    this.colors = paletteFromBlocks.length > 0 ? paletteFromBlocks : this.getVisualColors(this.baseColors);
    this.matches = 0;
    this.comboMultiplier = 1;
    this.selectedBlock = null;
    this.actionLocked = false;
    this.rebuildBoardModifiers();

    this.createHud();
    this.generateGrid();
  }

  private createHud(): void {
    const margin = Math.max(16, this.safeBounds.width * 0.04);
    const topOffset = this.safeBounds.top + 40;

    const instruction = this.variantMeta?.flavorText || 'Собери цепочки и зарядись энергией артефакта!';

    this.instructionText = this.add
      .text(this.safeBounds.centerX, topOffset, instruction, {
        fontSize: this.getResponsiveFont(20),
        color: '#ffffff',
        fontFamily: 'Arial',
        align: 'center',
        wordWrap: { width: Math.min(this.safeBounds.width - margin * 2, 480) },
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.targetText = this.add
      .text(this.safeBounds.left + margin, topOffset + 34, '', {
        fontSize: this.getResponsiveFont(16),
        color: '#f5f5f5',
        fontFamily: 'Arial',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    this.moveText = this.add
      .text(this.safeBounds.right - margin, topOffset + 34, '', {
        fontSize: this.getResponsiveFont(16),
        color: '#f5f5f5',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);

    this.progressBarWidth = Math.min(this.safeBounds.width - margin * 2, 420);
    const barY = topOffset + 76;

    this.progressBarBg = this.add
      .rectangle(this.safeBounds.centerX, barY, this.progressBarWidth, 12, 0xffffff, 0.2)
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.progressBarFill = this.add
      .rectangle(this.progressBarBg.x - this.progressBarWidth / 2, barY, 0, 12, 0x4caf50, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    this.comboText = this.add
      .text(this.safeBounds.centerX, barY + 30, '', {
        fontSize: this.getResponsiveFont(14),
        color: '#ffd54f',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.updateHud();
  }

  private getResponsiveFont(size: number): string {
    const scaleFactor = Phaser.Math.Clamp(this.safeBounds.width / 390, 0.85, 1.3);
    return `${Math.round(size * scaleFactor)}px`;
  }

  private generateGrid(): void {
    let attempt = 0;
    let hasStartingMatches: boolean;

    do {
      this.destroyGrid();
      this.calculateLayout();
      this.renderBoardDecorations();

      for (let row = 0; row < this.gridSize; row++) {
        for (let col = 0; col < this.gridSize; col++) {
          if (this.isCellBlocked(row, col)) {
            this.grid[row][col] = null;
            continue;
          }
          this.createBlock(row, col);
        }
      }

      hasStartingMatches = this.hasImmediateMatches();
      attempt++;
    } while (hasStartingMatches && attempt < 8);
  }

  private destroyGrid(): void {
    for (const row of this.grid) {
      for (const block of row ?? []) {
        block?.sprite.destroy();
      }
    }

    this.grid = Array.from({ length: this.gridSize }, () => Array<PuzzleBlock | null>(this.gridSize).fill(null));
    this.clearBoardDecorations();
  }

  private calculateLayout(): void {
    const horizontalPadding = Math.max(16, this.safeBounds.width * 0.05);
    const innerTopPadding = Math.max(120, this.safeBounds.height * 0.12);
    const innerBottomPadding = Math.max(60, this.safeBounds.height * 0.08);

    const availableWidth = this.safeBounds.width - horizontalPadding * 2;
    const availableHeight = this.safeBounds.height - innerTopPadding - innerBottomPadding;
    const maxGridSpan = Math.max(Math.min(availableWidth, availableHeight), 120);
    const totalGap = this.cellGap * (this.gridSize - 1);

    this.blockSize = Math.floor((maxGridSpan - totalGap) / this.gridSize);
    this.blockSize = Phaser.Math.Clamp(this.blockSize, 26, 96);

    const gridPixelSize = this.blockSize * this.gridSize + totalGap;
    this.layoutStartX = this.safeBounds.left + horizontalPadding + (availableWidth - gridPixelSize) / 2 + this.blockSize / 2;
    this.layoutStartY = this.safeBounds.top + innerTopPadding + (availableHeight - gridPixelSize) / 2 + this.blockSize / 2;
  }

  private createBlock(row: number, col: number, blockType?: NormalizedBlockType): PuzzleBlock {
    if (this.isCellBlocked(row, col)) {
      throw new Error(`Attempted to create block in blocked cell (${row}, ${col})`);
    }

    const selectedType = blockType ?? this.pickBlockType();
    const chosenColor = selectedType.color;
    const position = this.getBlockPosition(row, col);
    const sprite = this.add.rectangle(position.x, position.y, this.blockSize, this.blockSize, chosenColor, 1);

    sprite.setOrigin(0.5);
    sprite.setInteractive({ useHandCursor: true });

    const block: PuzzleBlock = {
      sprite,
      color: chosenColor,
      row,
      col,
      typeId: selectedType.id,
      power: selectedType.power,
      bonusScore: selectedType.bonusScore,
    };

    sprite.on('pointerdown', () => this.selectBlock(block));
    this.grid[row][col] = block;

    return block;
  }

  private getBlockPosition(row: number, col: number): { x: number; y: number } {
    const x = this.layoutStartX + col * (this.blockSize + this.cellGap);
    const y = this.layoutStartY + row * (this.blockSize + this.cellGap);
    return { x, y };
  }

  private selectBlock(block: PuzzleBlock): void {
    if (this.gameEnded || this.actionLocked) {
      return;
    }

    if (!this.selectedBlock) {
      this.selectedBlock = block;
      block.sprite.setStrokeStyle(3, 0xffffff);
      return;
    }

    if (block === this.selectedBlock) {
      block.sprite.setStrokeStyle();
      this.selectedBlock = null;
      return;
    }

    if (this.areAdjacent(this.selectedBlock, block)) {
      const first = this.selectedBlock;
      first.sprite.setStrokeStyle();
      this.selectedBlock = null;
      this.handleSwap(first, block);
    } else {
      this.selectedBlock.sprite.setStrokeStyle();
      this.selectedBlock = block;
      block.sprite.setStrokeStyle(3, 0xffffff);
    }
  }

  private handleSwap(block1: PuzzleBlock, block2: PuzzleBlock): void {
    if (this.actionLocked) {
      return;
    }

    this.actionLocked = true;
    this.swapBlocks(block1, block2);

    const hadMatches = this.resolveBoard();

    if (!hadMatches) {
      this.time.delayedCall(160, () => {
        this.swapBlocks(block1, block2);
        this.shakeBlock(block1.sprite);
        this.shakeBlock(block2.sprite);
        this.comboMultiplier = 1;
        this.consumeMove(false);
        this.actionLocked = false;
      });
    } else {
      this.consumeMove(true);
      this.actionLocked = false;
    }
  }

  private areAdjacent(block1: PuzzleBlock, block2: PuzzleBlock): boolean {
    const rowDiff = Math.abs(block1.row - block2.row);
    const colDiff = Math.abs(block1.col - block2.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
  }

  private swapBlocks(block1: PuzzleBlock, block2: PuzzleBlock): void {
    const block1Row = block1.row;
    const block1Col = block1.col;

    block1.row = block2.row;
    block1.col = block2.col;
    block2.row = block1Row;
    block2.col = block1Col;

    this.grid[block1.row][block1.col] = block1;
    this.grid[block2.row][block2.col] = block2;

    this.positionBlockSprite(block1);
    this.positionBlockSprite(block2);
  }

  private positionBlockSprite(block: PuzzleBlock): void {
    const { x, y } = this.getBlockPosition(block.row, block.col);

    this.tweens.add({
      targets: block.sprite,
      x,
      y,
      duration: 110,
      ease: 'Quad.easeOut',
    });

    block.sprite.setDisplaySize(this.blockSize, this.blockSize);
  }

  private resolveBoard(): boolean {
    let cascades = 0;
    let totalGroups = 0;

    while (true) {
      const scanResult = this.scanMatches();
      if (scanResult.groups === 0) {
        break;
      }

      cascades++;
      totalGroups += scanResult.groups;

      const clearedBlocks = this.destroyMatches(scanResult.mask);
      const cascadeBonus = 1 + (cascades - 1) * 0.25;

      this.matches += scanResult.groups;
      this.comboMultiplier = Number((1 + (cascades - 1) * 0.5).toFixed(1));
      this.updateScore(Math.round(clearedBlocks * 15 * cascadeBonus));

      this.fillEmptySpaces();
    }

    if (cascades > 0) {
      this.evaluateBonusRules({ cascades, combo: this.comboMultiplier, totalMatches: this.matches });
      this.updateHud();
      if (this.matches >= this.targetMatches) {
        this.handleVictory();
      }
      return true;
    }

    this.comboMultiplier = 1;
    this.updateHud();
    return false;
  }

  private scanMatches(): MatchScanResult {
    const mask = Array.from({ length: this.gridSize }, () => Array<boolean>(this.gridSize).fill(false));
    let groups = 0;

    // Горизонтальные цепочки
    for (let row = 0; row < this.gridSize; row++) {
      let streak: PuzzleBlock[] = [];
      for (let col = 0; col < this.gridSize; col++) {
        const block = this.grid[row][col];
        if (block) {
          if (streak.length === 0 || block.color === streak[0].color) {
            streak.push(block);
        } else {
            if (streak.length >= 3) {
              this.markStreak(mask, streak);
              groups++;
            }
            streak = [block];
          }
        } else {
          if (streak.length >= 3) {
            this.markStreak(mask, streak);
            groups++;
          }
          streak = [];
        }
      }
      if (streak.length >= 3) {
        this.markStreak(mask, streak);
        groups++;
      }
    }

    // Вертикальные цепочки
    for (let col = 0; col < this.gridSize; col++) {
      let streak: PuzzleBlock[] = [];
      for (let row = 0; row < this.gridSize; row++) {
        const block = this.grid[row][col];
        if (block) {
          if (streak.length === 0 || block.color === streak[0].color) {
            streak.push(block);
        } else {
            if (streak.length >= 3) {
              this.markStreak(mask, streak);
              groups++;
            }
            streak = [block];
          }
        } else {
          if (streak.length >= 3) {
            this.markStreak(mask, streak);
            groups++;
          }
          streak = [];
        }
      }
      if (streak.length >= 3) {
        this.markStreak(mask, streak);
        groups++;
      }
    }

    return { mask, groups };
  }

  private hasImmediateMatches(): boolean {
    const result = this.scanMatches();
    return result.groups > 0;
  }

  private markStreak(mask: boolean[][], streak: PuzzleBlock[]): void {
    for (const block of streak) {
      mask[block.row][block.col] = true;
    }
  }

  private destroyMatches(mask: boolean[][]): number {
    this.applySpecialBlockEffects(mask);
    let removed = 0;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        if (mask[row][col]) {
          const block = this.grid[row][col];
          if (!block) {
            continue;
          }

          if (block.bonusScore > 0) {
            this.updateScore(block.bonusScore);
          }
          if (block.power === 'scoreBoost') {
            this.updateScore(Math.max(6, Math.round(block.bonusScore || 12)));
          }

          block.sprite.destroy();
          this.grid[row][col] = null;
          removed++;
        }
      }
    }

    return removed;
  }

  private fillEmptySpaces(): void {
    for (let col = 0; col < this.gridSize; col++) {
      let writeIndex = this.gridSize - 1;

      for (let row = this.gridSize - 1; row >= 0; row--) {
        if (this.isCellBlocked(row, col)) {
          this.grid[row][col] = null;
          writeIndex = row - 1;
          continue;
        }

        const block = this.grid[row][col];
        if (block) {
          if (row !== writeIndex) {
            this.grid[writeIndex][col] = block;
            block.row = writeIndex;
            this.grid[row][col] = null;
            this.positionBlockSprite(block);
          }
          writeIndex--;
        }
      }

      for (let row = writeIndex; row >= 0; row--) {
        if (this.isCellBlocked(row, col)) {
          writeIndex = row - 1;
          continue;
        }

        const block = this.createBlock(row, col);
        block.sprite.setScale(0);
        this.tweens.add({
          targets: block.sprite,
          scaleX: 1,
          scaleY: 1,
          duration: 160,
          ease: 'Back.Out',
        });
      }
    }
  }

  private consumeMove(success: boolean): void {
    this.movesLeft = Math.max(0, this.movesLeft - 1);
    this.updateHud();

    if (this.movesLeft === 0 && !this.gameEnded) {
      if (this.matches >= this.targetMatches) {
        this.handleVictory();
      } else {
        this.handleFailure(success);
      }
    }
  }

  private handleVictory(): void {
    if (this.gameEnded) {
      return;
    }
    this.updateScore(200);
    this.showResult(true);
  }

  private handleFailure(lastMoveSuccessful: boolean): void {
    if (this.gameEnded) {
      return;
    }
    if (lastMoveSuccessful) {
      this.updateScore(50);
    }
    this.showResult(false);
  }

  private showResult(success: boolean): void {
    if (this.gameEnded) {
      return;
    }

    this.gameEnded = true;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.78);
    overlay.setScrollFactor(0);

    const title = success ? 'Миссия выполнена!' : 'Ходы закончились';
    const subtitle = success
      ? `Цепочки: ${this.matches}/${this.targetMatches}`
      : `Не хватило еще ${Math.max(0, this.targetMatches - this.matches)} цепочек`;

    const titleText = this.add
      .text(centerX, centerY - 40, title, {
        fontSize: this.getResponsiveFont(28),
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const detailText = this.add
      .text(centerX, centerY, subtitle, {
        fontSize: this.getResponsiveFont(18),
        color: '#dddddd',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const continueButton = this.add
      .text(centerX, centerY + 60, 'Продолжить', {
        fontSize: this.getResponsiveFont(20),
        color: '#4caf50',
        fontFamily: 'Arial',
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);

    continueButton.on('pointerdown', () => {
      overlay.destroy();
      titleText.destroy();
      detailText.destroy();
      continueButton.destroy();
      this.endGame();
    });
  }

  private updateHud(): void {
    if (!this.targetText || !this.moveText) {
      return;
    }

    const margin = Math.max(16, this.safeBounds.width * 0.04);
    const centerX = this.safeBounds.centerX;
    const left = this.safeBounds.left + margin;
    const right = this.safeBounds.right - margin;

    this.instructionText.setPosition(centerX, this.instructionText.y);
    this.targetText.setPosition(left, this.targetText.y);
    this.moveText.setPosition(right, this.moveText.y);
    this.progressBarBg.setPosition(centerX, this.progressBarBg.y);
    this.progressBarFill.setPosition(this.progressBarBg.x - this.progressBarWidth / 2, this.progressBarFill.y);
    this.comboText.setPosition(centerX, this.comboText.y);

    this.targetText.setText(`Цель: ${this.matches}/${this.targetMatches}`);
    this.moveText.setText(`Ходы: ${this.movesLeft}`);
    const variantLabel = this.variantMeta?.codename ? ` • ${this.variantMeta.codename}` : '';
    const bonusLabel = this.bonusMessage ? ` • ${this.bonusMessage}` : '';
    this.comboText.setText(`Комбо x${this.comboMultiplier.toFixed(1)}${variantLabel}${bonusLabel}`);

    const progress = Phaser.Math.Clamp(this.matches / this.targetMatches, 0, 1);
    this.progressBarFill.setDisplaySize(this.progressBarWidth * progress, this.progressBarBg.displayHeight);
  }

  private loadVariantSettings(): void {
    const generated = (this.gameData?.gameData as GeneratedGameData | undefined) ?? undefined;
    const mechanics = generated?.mechanics;
    const rawVariant =
      mechanics && typeof mechanics === 'object'
        ? (mechanics as Record<string, unknown>)['puzzleVariant']
        : undefined;
    const normalized = this.normalizeVariantSource(rawVariant);

    this.variantMeta = normalized.meta;
    this.normalizedBlockTypes = normalized.blocks;
    this.totalSpawnWeight = this.normalizedBlockTypes.reduce((sum, block) => sum + block.spawnWeight, 0);
    if (this.totalSpawnWeight <= 0) {
      this.totalSpawnWeight = this.normalizedBlockTypes.length || 1;
    }
    this.blockTypeMap = new Map(this.normalizedBlockTypes.map((block) => [block.id, block]));
    this.bonusRules = normalized.bonusRules;
    this.boardModifiersRaw = normalized.boardModifier;
    this.triggeredBonuses.clear();
  }

  private normalizeVariantSource(
    rawVariant: unknown,
  ): {
    meta: VariantMeta;
    blocks: NormalizedBlockType[];
    bonusRules: PuzzleBonusRule[];
    boardModifier?: PuzzleBoardModifier;
  } {
    const defaultMeta: VariantMeta = {
      codename: 'Crystal Charge',
      flavorText: 'Собери цепочки и зарядись энергией артефакта!',
    };

    if (!rawVariant || typeof rawVariant !== 'object') {
      return {
        meta: defaultMeta,
        blocks: this.buildFallbackBlocks(),
        bonusRules: [],
      };
    }

    const variant = rawVariant as Partial<PuzzleVariantSettings>;
    const meta: VariantMeta = {
      codename:
        typeof variant.codename === 'string' && variant.codename.trim().length > 0
          ? variant.codename.trim()
          : defaultMeta.codename,
      flavorText:
        typeof variant.flavorText === 'string' && variant.flavorText.trim().length > 0
          ? variant.flavorText.trim()
          : defaultMeta.flavorText,
      baseGridSize:
        typeof variant.baseGridSize === 'number' ? Phaser.Math.Clamp(Math.round(variant.baseGridSize), 4, 9) : undefined,
      targetMatchesModifier:
        typeof variant.targetMatchesModifier === 'number'
          ? Phaser.Math.Clamp(variant.targetMatchesModifier, 0.5, 2)
          : undefined,
      moveBudgetModifier:
        typeof variant.moveBudgetModifier === 'number'
          ? Phaser.Math.Clamp(variant.moveBudgetModifier, 0.5, 2)
          : undefined,
    };

    const blocks = this.normalizeBlockTypes(variant.blockTypes);

    return {
      meta,
      blocks: blocks.length > 0 ? blocks : this.buildFallbackBlocks(),
      bonusRules: this.normalizeBonusRules(variant.bonusRules),
      boardModifier: this.normalizeBoardModifier(variant.boardModifiers),
    };
  }

  private normalizeBlockTypes(input?: PuzzleBlockType[] | unknown): NormalizedBlockType[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const allowedPowers: PuzzleBlockPower[] = ['bomb', 'lineHorizontal', 'lineVertical', 'colorClear', 'scoreBoost', 'none'];
    const normalized: NormalizedBlockType[] = [];

    input.forEach((block, index) => {
      if (!block || typeof block !== 'object') {
        return;
      }
      const typed = block as PuzzleBlockType;
      const colorValue = this.parseHexColor(typed.color);
      if (colorValue === null) {
        return;
      }

      const id = typeof typed.id === 'string' && typed.id.trim().length > 0 ? typed.id.trim() : `block-${index}`;
      const name = typeof typed.name === 'string' && typed.name.trim().length > 0 ? typed.name.trim() : `Блок ${index + 1}`;
      const powerCandidate = typeof typed.power === 'string' ? (typed.power as PuzzleBlockPower) : undefined;
      const normalizedPower =
        powerCandidate && allowedPowers.includes(powerCandidate) && powerCandidate !== 'none' ? powerCandidate : undefined;
      const spawnWeight = this.safeNumber(typed.spawnWeight, 1, 0.2, 12);
      if (spawnWeight <= 0) {
        return;
      }

      const bonusScore = Math.max(0, Math.round(this.safeNumber(typed.bonusScore, 0, 0, 120)));

      normalized.push({
        id,
        name,
        color: colorValue,
        spawnWeight,
        power: normalizedPower,
        bonusScore,
      });
    });

    return normalized;
  }

  private buildFallbackBlocks(): NormalizedBlockType[] {
    return this.baseColors.map((color, index) => ({
      id: `fallback-${index}`,
      name: `Блок ${index + 1}`,
      color,
      spawnWeight: 1,
      bonusScore: 6,
    }));
  }

  private normalizeBonusRules(input?: PuzzleBonusRule[] | unknown): PuzzleBonusRule[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const allowedTriggers: PuzzleBonusTriggerType[] = ['totalMatches', 'combo', 'cascade'];
    const normalized: PuzzleBonusRule[] = [];

    input.forEach((rule, index) => {
      if (!rule || typeof rule !== 'object') {
        return;
      }

      const typed = rule as PuzzleBonusRule;
      const trigger = typed.triggerType as PuzzleBonusTriggerType;
      if (!allowedTriggers.includes(trigger)) {
        return;
      }

      const reward = typed.reward;
      if (!reward || typeof reward !== 'object') {
        return;
      }

      const normalizedReward: PuzzleBonusReward = {};
      if (typeof reward.extraMoves === 'number' && reward.extraMoves !== 0) {
        const extraMoves = Math.round(reward.extraMoves);
        if (extraMoves !== 0) {
          normalizedReward.extraMoves = extraMoves;
        }
      }
      if (typeof reward.score === 'number' && reward.score !== 0) {
        const score = Math.round(reward.score);
        if (score !== 0) {
          normalizedReward.score = score;
        }
      }
      if (typeof reward.spawnSpecialBlockId === 'string' && reward.spawnSpecialBlockId.trim().length > 0) {
        normalizedReward.spawnSpecialBlockId = reward.spawnSpecialBlockId.trim();
      }

      if (!normalizedReward.extraMoves && !normalizedReward.score && !normalizedReward.spawnSpecialBlockId) {
        return;
      }

      const id = typeof typed.id === 'string' && typed.id.trim().length > 0 ? typed.id.trim() : `bonus-${index}`;
      const name = typeof typed.name === 'string' && typed.name.trim().length > 0 ? typed.name.trim() : `Бонус ${index + 1}`;
      const description =
        typeof typed.description === 'string' && typed.description.trim().length > 0 ? typed.description.trim() : name;
      const threshold = Math.max(1, Math.round(this.safeNumber(typed.threshold, 1, 1, 999)));

      normalized.push({
        id,
        name,
        description,
        triggerType: trigger,
        threshold,
        reward: normalizedReward,
      });
    });

    return normalized;
  }

  private normalizeBoardModifier(input?: PuzzleBoardModifier | unknown): PuzzleBoardModifier | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const typed = input as PuzzleBoardModifier;
    const blockedCells =
      Array.isArray(typed.blockedCells) && typed.blockedCells.length > 0
        ? typed.blockedCells
            .map((cell) => {
              if (!cell || typeof cell !== 'object') {
                return null;
              }
              const row = typeof cell.row === 'number' ? Math.round(cell.row) : null;
              const col = typeof cell.col === 'number' ? Math.round(cell.col) : null;
              if (row === null || col === null) {
                return null;
              }
              return { row, col };
            })
            .filter((cell): cell is { row: number; col: number } => cell !== null)
        : undefined;

    return {
      presetName:
        typeof typed.presetName === 'string' && typed.presetName.trim().length > 0 ? typed.presetName.trim() : 'LLM Layout',
      description: typeof typed.description === 'string' ? typed.description : undefined,
      blockedCells,
    };
  }

  private safeNumber(value: unknown, fallback: number, min?: number, max?: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    let result = parsed;
    if (min !== undefined) {
      result = Math.max(min, result);
    }
    if (max !== undefined) {
      result = Math.min(max, result);
    }
    return result;
  }

  private parseHexColor(input?: string): number | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    let normalized = input.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    } else if (normalized.toLowerCase().startsWith('0x')) {
      normalized = normalized.slice(2);
    }

    normalized = normalized.replace(/[^a-f0-9]/gi, '');

    if (normalized.length === 3) {
      normalized = normalized
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }

    if (normalized.length !== 6) {
      return null;
    }

    const value = Number.parseInt(normalized, 16);
    return Number.isNaN(value) ? null : value;
  }

  private rebuildBoardModifiers(): void {
    this.blockedCells.clear();
    if (!this.boardModifiersRaw?.blockedCells || this.boardModifiersRaw.blockedCells.length === 0) {
      return;
    }

    this.boardModifiersRaw.blockedCells.forEach((cell) => {
      const row = this.clampCellIndex(cell.row);
      const col = this.clampCellIndex(cell.col);
      if (row === null || col === null) {
        return;
      }
      this.blockedCells.add(this.getCellKey(row, col));
    });
  }

  private clampCellIndex(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    const rounded = Math.round(value);
    if (rounded < 0 || rounded >= this.gridSize) {
      return null;
    }
    return rounded;
  }

  private getCellKey(row: number, col: number): string {
    return `${row}:${col}`;
  }

  private isWithinBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize;
  }

  private isCellBlocked(row: number, col: number): boolean {
    if (!this.isWithinBounds(row, col)) {
      return true;
    }
    return this.blockedCells.has(this.getCellKey(row, col));
  }

  private renderBoardDecorations(): void {
    this.clearBoardDecorations();
    if (this.blockedCells.size === 0) {
      return;
    }

    for (const key of this.blockedCells) {
      const [rowStr, colStr] = key.split(':');
      const row = Number(rowStr);
      const col = Number(colStr);
      if (!this.isWithinBounds(row, col)) {
        continue;
      }
      const { x, y } = this.getBlockPosition(row, col);
      const obstacle = this.add.rectangle(x, y, this.blockSize, this.blockSize, 0x000000, 0.45);
      obstacle.setStrokeStyle(2, 0xffffff, 0.12);
      obstacle.setDepth(-0.5);
      this.boardDecorations.push(obstacle);
    }
  }

  private clearBoardDecorations(): void {
    this.boardDecorations.forEach((sprite) => sprite.destroy());
    this.boardDecorations = [];
  }

  private pickBlockType(): NormalizedBlockType {
    if (this.normalizedBlockTypes.length === 0) {
      this.normalizedBlockTypes = this.buildFallbackBlocks();
      this.totalSpawnWeight = this.normalizedBlockTypes.reduce((sum, block) => sum + block.spawnWeight, 0);
      this.blockTypeMap = new Map(this.normalizedBlockTypes.map((block) => [block.id, block]));
    }

    const roll = Phaser.Math.FloatBetween(0, this.totalSpawnWeight);
    let accumulator = 0;

    for (const type of this.normalizedBlockTypes) {
      accumulator += type.spawnWeight;
      if (roll <= accumulator) {
        return type;
      }
    }

    return this.normalizedBlockTypes[this.normalizedBlockTypes.length - 1];
  }

  private applySpecialBlockEffects(mask: boolean[][]): void {
    const extraCells: { row: number; col: number }[] = [];
    const colorClears = new Set<string>();

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        if (!mask[row][col]) {
          continue;
        }

        const block = this.grid[row][col];
        if (!block?.power) {
          continue;
        }

        switch (block.power) {
          case 'bomb':
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const targetRow = row + dr;
                const targetCol = col + dc;
                if (this.isWithinBounds(targetRow, targetCol) && !this.isCellBlocked(targetRow, targetCol)) {
                  extraCells.push({ row: targetRow, col: targetCol });
                }
              }
            }
            break;
          case 'lineHorizontal':
            for (let c = 0; c < this.gridSize; c++) {
              if (!this.isCellBlocked(row, c)) {
                extraCells.push({ row, col: c });
              }
            }
            break;
          case 'lineVertical':
            for (let r = 0; r < this.gridSize; r++) {
              if (!this.isCellBlocked(r, col)) {
                extraCells.push({ row: r, col });
              }
            }
            break;
          case 'colorClear':
            colorClears.add(block.typeId);
            break;
          default:
            break;
        }
      }
    }

    extraCells.forEach(({ row, col }) => {
      if (this.isWithinBounds(row, col) && !this.isCellBlocked(row, col)) {
        mask[row][col] = true;
      }
    });

    if (colorClears.size > 0) {
      for (let row = 0; row < this.gridSize; row++) {
        for (let col = 0; col < this.gridSize; col++) {
          const block = this.grid[row][col];
          if (block && colorClears.has(block.typeId)) {
            mask[row][col] = true;
          }
        }
      }
    }
  }

  private evaluateBonusRules(context: { cascades: number; combo: number; totalMatches: number }): void {
    if (!this.bonusRules.length) {
      return;
    }

    for (const rule of this.bonusRules) {
      if (this.triggeredBonuses.has(rule.id)) {
        continue;
      }

      let conditionMet = false;
      switch (rule.triggerType) {
        case 'totalMatches':
          conditionMet = context.totalMatches >= rule.threshold;
          break;
        case 'combo':
          conditionMet = context.combo >= rule.threshold;
          break;
        case 'cascade':
          conditionMet = context.cascades >= rule.threshold;
          break;
        default:
          break;
      }

      if (conditionMet) {
        this.triggeredBonuses.add(rule.id);
        this.applyBonusReward(rule);
      }
    }
  }

  private applyBonusReward(rule: PuzzleBonusRule): void {
    const reward = rule.reward;
    if (!reward) {
      return;
    }

    if (typeof reward.extraMoves === 'number' && reward.extraMoves !== 0) {
      this.movesLeft = Math.max(0, this.movesLeft + reward.extraMoves);
    }
    if (typeof reward.score === 'number' && reward.score !== 0) {
      this.updateScore(reward.score);
    }
    if (reward.spawnSpecialBlockId) {
      this.spawnSpecialBlock(reward.spawnSpecialBlockId);
    }

    const rewardText = this.formatBonusReward(reward);
    if (rewardText) {
      this.bonusMessage = `${rule.name}: ${rewardText}`;
      if (this.bonusMessageTimer) {
        this.bonusMessageTimer.remove(false);
      }
      this.bonusMessageTimer = this.time.delayedCall(4000, () => {
        this.bonusMessage = '';
        this.updateHud();
      });
    }

    this.updateHud();
  }

  private formatBonusReward(reward: PuzzleBonusReward): string {
    const parts: string[] = [];
    if (typeof reward.extraMoves === 'number' && reward.extraMoves !== 0) {
      const sign = reward.extraMoves > 0 ? '+' : '';
      parts.push(`${sign}${reward.extraMoves} ход`);
    }
    if (typeof reward.score === 'number' && reward.score !== 0) {
      const sign = reward.score > 0 ? '+' : '';
      parts.push(`${sign}${reward.score} очков`);
    }
    if (reward.spawnSpecialBlockId) {
      parts.push(`блок ${reward.spawnSpecialBlockId}`);
    }
    return parts.join(', ');
  }

  private spawnSpecialBlock(blockTypeId: string): void {
    const config = this.blockTypeMap.get(blockTypeId) ?? this.normalizedBlockTypes[0];
    if (!config) {
      return;
    }

    const freeCells: { row: number; col: number }[] = [];
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        if (this.isCellBlocked(row, col)) {
          continue;
        }
        if (!this.grid[row][col]) {
          freeCells.push({ row, col });
        }
      }
    }

    if (freeCells.length === 0) {
      return;
    }

    const target = Phaser.Math.RND.pick(freeCells);
    const block = this.createBlock(target.row, target.col, config);
    block.sprite.setScale(0);
    this.tweens.add({
      targets: block.sprite,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Back.Out',
    });
  }

  private shakeBlock(sprite: Phaser.GameObjects.Rectangle): void {
    this.tweens.add({
      targets: sprite,
      scaleX: 0.92,
      scaleY: 0.92,
      yoyo: true,
      duration: 80,
      ease: 'Quad.easeOut',
    });
  }
}

