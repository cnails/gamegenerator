import Phaser from 'phaser';

type Direction = -1 | 0 | 1;

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  direction: Direction;
  jumpTriggered: boolean;
  startTime: number;
}

export interface InputControllerOptions {
  swipeThreshold?: number;
  tapThreshold?: number;
  holdDeadzone?: number;
  maxTapDurationMs?: number;
}

export class InputController {
  private readonly scene: Phaser.Scene;
  private readonly swipeThreshold: number;
  private readonly tapThreshold: number;
  private readonly holdDeadzone: number;
  private readonly maxTapDuration: number;

  private readonly pointerStates = new Map<number, PointerState>();
  private movementDirection: Direction = 0;
  private jumpQueued = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: InputControllerOptions = {}) {
    this.scene = scene;
    this.swipeThreshold = options.swipeThreshold ?? 60;
    this.tapThreshold = options.tapThreshold ?? 14;
    this.holdDeadzone = options.holdDeadzone ?? 10;
    this.maxTapDuration = options.maxTapDurationMs ?? 220;

    scene.input.on('pointerdown', this.handlePointerDown, this);
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);
    scene.input.on('pointerupoutside', this.handlePointerUp, this);
    scene.input.on('pointercancel', this.handlePointerUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  getMovementDirection(): Direction {
    return this.movementDirection;
  }

  consumeJumpRequest(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
    this.scene.input.off('pointercancel', this.handlePointerUp, this);
    this.pointerStates.clear();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const state: PointerState = {
      id: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      lastX: pointer.x,
      lastY: pointer.y,
      direction: 0,
      jumpTriggered: false,
      startTime: pointer.downTime ?? this.scene.time.now,
    };
    this.pointerStates.set(pointer.id, state);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const state = this.pointerStates.get(pointer.id);
    if (!state) {
      return;
    }

    state.lastX = pointer.x;
    state.lastY = pointer.y;

    const deltaX = pointer.x - state.startX;
    const deltaY = pointer.y - state.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Swipe up triggers jump
    if (!state.jumpTriggered && -deltaY > this.swipeThreshold && absDeltaY > absDeltaX * 1.1) {
      state.jumpTriggered = true;
      this.queueJump();
    }

    // Horizontal swipe for movement
    if (absDeltaX > this.swipeThreshold && absDeltaX >= absDeltaY * 0.8) {
      const newDirection: Direction = deltaX < 0 ? -1 : 1;
      if (state.direction !== newDirection) {
        state.direction = newDirection;
        this.refreshMovementDirection();
      }
      return;
    }

    // Allow changing direction if user crosses to opposite side during hold
    if (state.direction !== 0 && deltaX * state.direction < -this.holdDeadzone) {
      state.direction = deltaX < 0 ? -1 : 1;
      this.refreshMovementDirection();
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const state = this.pointerStates.get(pointer.id);
    if (state) {
      const totalX = pointer.x - state.startX;
      const totalY = pointer.y - state.startY;
      const duration = (pointer.upTime ?? this.scene.time.now) - state.startTime;

      if (!state.jumpTriggered && Math.abs(totalX) < this.tapThreshold && Math.abs(totalY) < this.tapThreshold && duration <= this.maxTapDuration) {
        this.queueJump();
      }
    }

    this.pointerStates.delete(pointer.id);
    this.refreshMovementDirection();
  }

  private refreshMovementDirection(): void {
    let direction: number = 0;
    this.pointerStates.forEach((state) => {
      direction += state.direction;
    });

    if (direction > 0) {
      this.movementDirection = 1;
    } else if (direction < 0) {
      this.movementDirection = -1;
    } else {
      this.movementDirection = 0;
    }
  }

  private queueJump(): void {
    this.jumpQueued = true;
  }
}


