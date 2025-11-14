import { VerticalBaseScene } from './VerticalStandardScene';
import Phaser from 'phaser';

interface PuzzleBlock {
  sprite: Phaser.GameObjects.Rectangle;
  color: number;
  row: number;
  col: number;
}

interface MatchScanResult {
  mask: boolean[][];
  groups: number;
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

  private instructionText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private moveText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private progressBarBg!: Phaser.GameObjects.Rectangle;
  private progressBarFill!: Phaser.GameObjects.Rectangle;
  private progressBarWidth: number = 0;

  initGame(): void {
    const params = this.gameData?.config?.params ?? {};
    this.initVerticalLayout({
      minSafeWidth: 360,
      maxSafeWidth: 520,
      paddingX: 0.05,
      paddingY: 0.04,
    });

    this.gridSize = (params.gridSize as number) || 6;
    this.targetMatches = (params.targetMatches as number) || Math.max(14, this.gridSize * 2);
    this.movesLeft = (params.moves as number) || Math.max(16, this.gridSize * 2 + 2);
    this.cellGap = Phaser.Math.Clamp((params.cellGap as number) || 6, 2, 14);
    this.colors = this.getVisualColors(this.baseColors);
    this.matches = 0;
    this.comboMultiplier = 1;
    this.selectedBlock = null;
    this.actionLocked = false;

    this.createHud();
    this.generateGrid();
  }

  private createHud(): void {
    const margin = Math.max(16, this.safeBounds.width * 0.04);
    const topOffset = this.safeBounds.top + 40;

    this.instructionText = this.add
      .text(this.safeBounds.centerX, topOffset, 'Собери цепочки и зарядись энергией артефакта!', {
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

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
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

  private createBlock(row: number, col: number, color?: number): PuzzleBlock {
    const chosenColor = color ?? Phaser.Math.RND.pick(this.colors);
    const position = this.getBlockPosition(row, col);
    const sprite = this.add.rectangle(position.x, position.y, this.blockSize, this.blockSize, chosenColor, 1);

    sprite.setOrigin(0.5);
    sprite.setInteractive({ useHandCursor: true });

    const block: PuzzleBlock = { sprite, color: chosenColor, row, col };

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
    let removed = 0;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        if (mask[row][col] && this.grid[row][col]) {
          this.grid[row][col]?.sprite.destroy();
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
    this.comboText.setText(`Комбо x${this.comboMultiplier.toFixed(1)}`);

    const progress = Phaser.Math.Clamp(this.matches / this.targetMatches, 0, 1);
    this.progressBarFill.setDisplaySize(this.progressBarWidth * progress, this.progressBarBg.displayHeight);
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

