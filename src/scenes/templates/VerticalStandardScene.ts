import Phaser from 'phaser';
import { BaseGameScene } from '../BaseGameScene';

export interface VerticalLayoutOptions {
  targetAspect?: number;
  minSafeWidth?: number;
  maxSafeWidth?: number;
  paddingX?: number;
  paddingY?: number;
  enablePointer?: boolean;
  extraPointers?: number;
}

const DEFAULT_LAYOUT_OPTIONS: Required<VerticalLayoutOptions> = {
  targetAspect: 9 / 16,
  minSafeWidth: 360,
  maxSafeWidth: 520,
  paddingX: 0.06,
  paddingY: 0.08,
  enablePointer: false,
  extraPointers: 0,
};

export abstract class VerticalBaseScene extends BaseGameScene {
  protected safeBounds!: Phaser.Geom.Rectangle;
  protected playBounds!: Phaser.Geom.Rectangle;

  private layoutOptions: Required<VerticalLayoutOptions> = DEFAULT_LAYOUT_OPTIONS;
  private layoutInitialized: boolean = false;
  private pointerRegistered: boolean = false;

  protected initVerticalLayout(options: Partial<VerticalLayoutOptions> = {}): void {
    if (this.layoutInitialized) {
      console.warn('[VerticalBaseScene] Layout already initialized');
      return;
    }

    this.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
    this.layoutInitialized = true;

    this.recalculateBounds(this.scale.width, this.scale.height);

    if (this.layoutOptions.enablePointer) {
      const additionalPointers = Math.max(0, this.layoutOptions.extraPointers);
      if (additionalPointers > 0) {
        this.input.addPointer(additionalPointers);
      }
      this.pointerRegistered = true;
      this.input.on('pointerdown', this.handlePointerDown, this);
      this.input.on('pointermove', this.handlePointerMove, this);
      this.input.on('pointerup', this.handlePointerUp, this);
      this.input.on('pointerupoutside', this.handlePointerUp, this);
      this.input.on('pointerout', this.handlePointerUp, this);
    }

    this.scale.on('resize', this.onLayoutResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyVerticalLayout());
  }

  protected destroyVerticalLayout(): void {
    if (!this.layoutInitialized) return;
    this.layoutInitialized = false;

    this.scale.off('resize', this.onLayoutResize, this);
    if (this.pointerRegistered) {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('pointerup', this.handlePointerUp, this);
      this.input.off('pointerupoutside', this.handlePointerUp, this);
      this.input.off('pointerout', this.handlePointerUp, this);
      this.pointerRegistered = false;
    }
  }

  protected onSafeAreaChanged(_safe: Phaser.Geom.Rectangle, _play: Phaser.Geom.Rectangle): void {
    // Дочерние сцены могут переопределить для реагирования на resize
  }

  protected onPointerDown(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected onPointerMove(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected onPointerUp(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected clampXWithinSafeArea(value: number, padding: number = 0): number {
    return Phaser.Math.Clamp(value, this.safeBounds.left + padding, this.safeBounds.right - padding);
  }

  protected clampYWithinSafeArea(value: number, padding: number = 0): number {
    return Phaser.Math.Clamp(value, this.safeBounds.top + padding, this.safeBounds.bottom - padding);
  }

  protected getSafeBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.safeBounds);
  }

  protected getPlayableBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.playBounds);
  }

  private onLayoutResize(gameSize: Phaser.Structs.Size): void {
    this.recalculateBounds(gameSize.width, gameSize.height);
  }

  private recalculateBounds(width: number, height: number): void {
    this.safeBounds = this.computeSafeBounds(width, height);
    this.playBounds = this.computePlayBounds(this.safeBounds);
    this.applyHudLayout();
    this.onSafeAreaChanged(
      Phaser.Geom.Rectangle.Clone(this.safeBounds),
      Phaser.Geom.Rectangle.Clone(this.playBounds),
    );
  }

  private computeSafeBounds(width: number, height: number): Phaser.Geom.Rectangle {
    const currentAspect = width / height;
    const desiredAspect = this.layoutOptions.targetAspect;

    if (currentAspect >= desiredAspect) {
      const safeWidth = height * desiredAspect;
      const clampedWidth = Phaser.Math.Clamp(safeWidth, this.layoutOptions.minSafeWidth, this.layoutOptions.maxSafeWidth);
      const offsetX = (width - clampedWidth) / 2;
      return new Phaser.Geom.Rectangle(offsetX, 0, clampedWidth, height);
    }

    const safeHeight = width / desiredAspect;
    const offsetY = (height - safeHeight) / 2;
    return new Phaser.Geom.Rectangle(0, offsetY, width, safeHeight);
  }

  private computePlayBounds(safeBounds: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const padX = safeBounds.width * this.layoutOptions.paddingX;
    const padY = safeBounds.height * this.layoutOptions.paddingY;
    return new Phaser.Geom.Rectangle(
      safeBounds.left + padX,
      safeBounds.top + padY,
      safeBounds.width - padX * 2,
      safeBounds.height - padY * 2,
    );
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.onPointerDown(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.onPointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.onPointerUp(pointer);
  }

  private applyHudLayout(): void {
    if (this.scoreText) {
      this.scoreText.setPosition(this.safeBounds.left + 16, this.safeBounds.top + 16);
    }
  }
}

export class VerticalStandardScene extends VerticalBaseScene {
  protected initGame(): void {
    this.initVerticalLayout({ enablePointer: true, extraPointers: 1 });

    const play = this.getPlayableBounds();
    this.add
      .rectangle(play.centerX, play.centerY, play.width, play.height, 0x0d111c, 0.85)
      .setDepth(-1)
      .setStrokeStyle(2, 0x1f2b44, 0.8);

    const label = this.add.text(
      play.centerX,
      play.centerY,
      'Vertical Template Ready\nДобавьте игровую механику',
      {
        fontSize: '26px',
        color: '#ffffff',
        align: 'center',
        fontFamily: 'Arial',
      },
    );
    label.setOrigin(0.5);
  }
}
