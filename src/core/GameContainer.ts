import type { GeneratedGame } from '@/types';
import type { GameManager } from './GameManager';

type SwipeEdge = 'left' | 'right';
type SwipeDirection = 'forward' | 'backward';

type VerticalEdge = 'top' | 'bottom';

interface GameContainerOptions {
  containerId?: string;
  gameManager: GameManager;
  horizontalSwipeThreshold?: number;
  verticalSwipeThreshold?: number;
  horizontalEdgeSize?: number;
  verticalEdgeSize?: number;
  onExit: () => void;
}

interface SwipeState {
  id: number;
  orientation: 'horizontal' | 'vertical';
  edge: SwipeEdge | VerticalEdge;
  startX: number;
  startY: number;
  triggered: boolean;
}

export class GameContainer {
  private readonly container: HTMLElement;
  private readonly wrapper: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly stageId: string;
  private readonly overlay: HTMLElement;
  private readonly swipeHint: HTMLElement;
  private readonly verticalHint: HTMLElement;
  private readonly thumbsContainer: HTMLElement;
  private readonly transitionLayer: HTMLElement;
  private readonly horizontalEdges: Map<SwipeEdge, HTMLElement> = new Map();
  private readonly verticalEdges: Map<VerticalEdge, HTMLElement> = new Map();
  private readonly pointerMoveHandler: (event: PointerEvent) => void;
  private readonly pointerUpHandler: (event: PointerEvent) => void;
  private readonly centerPointerDownHandler: (event: PointerEvent) => void;
  private readonly centerPointerMoveHandler: (event: PointerEvent) => void;
  private readonly centerPointerUpHandler: (event: PointerEvent) => void;
  private readonly horizontalSwipeThreshold: number;
  private readonly verticalSwipeThreshold: number;
  private readonly horizontalEdgeSize: number;
  private readonly verticalEdgeSize: number;
  private readonly onExit: () => void;
  private readonly transitionDuration = 260;
  private readonly gameManager: GameManager;
  private readonly verticalHintCooldown = 1200;
  private readonly transitionQueue: Array<{ index: number; direction: SwipeDirection }> = [];
  private games: GeneratedGame[] = [];
  private currentGameIndex = 0;
  private isTransitioning = false;
  private activeSwipe?: SwipeState;
  private centralSwipe?: {
    pointerIds: number[];
    startY: number;
    startX: number;
    triggered: boolean;
  };
  private readonly centerPointers = new Map<
    number,
    { startX: number; startY: number; currentX: number; currentY: number }
  >();
  private destroyed = false;
  private lastVerticalHint = 0;

  constructor(options: GameContainerOptions) {
    const container = document.getElementById(options.containerId ?? 'app');
    if (!container) {
      throw new Error(`Container with id "${options.containerId ?? 'app'}" not found`);
    }

    this.container = container;
    this.container.innerHTML = '';
    this.container.classList.add('game-mode');

    this.gameManager = options.gameManager;
    this.onExit = options.onExit;
    this.horizontalSwipeThreshold = options.horizontalSwipeThreshold ?? 110;
    this.verticalSwipeThreshold = options.verticalSwipeThreshold ?? 120;
    this.horizontalEdgeSize = options.horizontalEdgeSize ?? 64;
    this.verticalEdgeSize = options.verticalEdgeSize ?? 120;
    this.stageId = `game-stage-${Math.random().toString(36).slice(2, 8)}`;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'game-wrapper';

    this.stage = document.createElement('div');
    this.stage.className = 'game-stage';
    this.stage.id = this.stageId;
    this.stage.style.touchAction = 'none';
    this.stage.style.userSelect = 'none';
    this.wrapper.appendChild(this.stage);

    this.transitionLayer = document.createElement('div');
    this.transitionLayer.className = 'game-transition-layer';
    this.wrapper.appendChild(this.transitionLayer);

    this.container.appendChild(this.wrapper);
    this.wrapper.style.touchAction = 'none';
    this.wrapper.style.userSelect = 'none';

    this.overlay = document.createElement('div');
    this.overlay.className = 'game-swiper-overlay';

    const exitButton = document.createElement('button');
    exitButton.type = 'button';
    exitButton.className = 'exit-to-menu-btn';
    exitButton.textContent = '← Выйти в меню';
    exitButton.addEventListener('click', () => this.onExit());

    this.swipeHint = document.createElement('div');
    this.swipeHint.className = 'swipe-hint';
    this.swipeHint.textContent = 'Свайпните двумя пальцами вверх/вниз для смены игры';

    this.verticalHint = document.createElement('div');
    this.verticalHint.className = 'vertical-swipe-hint';
    this.verticalHint.innerHTML = `
      <div class="hint-arrow arrow-up">↑</div>
      <span>Двумя пальцами — следующая / предыдущая игра</span>
      <div class="hint-arrow arrow-down">↓</div>
    `;

    this.thumbsContainer = document.createElement('div');
    this.thumbsContainer.className = 'game-swiper-thumbs';

    this.overlay.appendChild(exitButton);
    this.overlay.appendChild(this.swipeHint);
    this.overlay.appendChild(this.verticalHint);
    this.overlay.appendChild(this.thumbsContainer);
    this.container.appendChild(this.overlay);

    this.createHorizontalEdgeZones();
    this.createVerticalEdgeZones();

    this.pointerMoveHandler = (event) => this.onPointerMove(event);
    this.pointerUpHandler = (event) => this.onPointerUp(event);
    this.centerPointerDownHandler = (event) => this.onCenterPointerDown(event);
    this.centerPointerMoveHandler = (event) => this.onCenterPointerMove(event);
    this.centerPointerUpHandler = (event) => this.onCenterPointerUp(event);

    window.addEventListener('pointermove', this.pointerMoveHandler);
    window.addEventListener('pointerup', this.pointerUpHandler);
    window.addEventListener('pointercancel', this.pointerUpHandler);
    this.stage.addEventListener('pointerdown', this.centerPointerDownHandler);
    this.stage.addEventListener('pointermove', this.centerPointerMoveHandler);
    this.stage.addEventListener('pointerup', this.centerPointerUpHandler);
    this.stage.addEventListener('pointercancel', this.centerPointerUpHandler);
  }

  setGames(games: GeneratedGame[], targetGameId?: string): void {
    this.games = games;
    if (!games.length) {
      this.showEmptyState();
      return;
    }

    const foundIndex = targetGameId ? games.findIndex((g) => g.id === targetGameId) : -1;
    this.currentGameIndex = foundIndex >= 0 ? foundIndex : 0;

    this.renderThumbs();
    this.updateHint(this.games[this.currentGameIndex]?.title);
    void this.startGameAtIndex(this.currentGameIndex, { immediate: true });
  }

  navigate(offset: number): void {
    this.navigateWithTransition(offset, offset > 0 ? 'forward' : 'backward');
  }

  private navigateWithTransition(offset: number, direction: SwipeDirection): void {
    if (!offset || this.games.length < 2) {
      return;
    }

    const targetIndex = this.currentGameIndex + offset;
    if (targetIndex < 0 || targetIndex >= this.games.length) {
      this.flashLimit(offset);
      return;
    }

    if (this.isTransitioning) {
      this.transitionQueue.push({ index: targetIndex, direction });
      return;
    }

    this.transitionQueue.push({ index: targetIndex, direction });
    void this.processTransitionQueue();
  }

  private async processTransitionQueue(): Promise<void> {
    if (this.isTransitioning || !this.transitionQueue.length) {
      return;
    }

    const next = this.transitionQueue.shift();
    if (!next) {
      return;
    }

    await this.swapGame(next.index, next.direction);
    if (this.transitionQueue.length) {
      void this.processTransitionQueue();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    window.removeEventListener('pointermove', this.pointerMoveHandler);
    window.removeEventListener('pointerup', this.pointerUpHandler);
    window.removeEventListener('pointercancel', this.pointerUpHandler);
    this.stage.removeEventListener('pointerdown', this.centerPointerDownHandler);
    this.stage.removeEventListener('pointermove', this.centerPointerMoveHandler);
    this.stage.removeEventListener('pointerup', this.centerPointerUpHandler);
    this.stage.removeEventListener('pointercancel', this.centerPointerUpHandler);

    this.horizontalEdges.forEach((zone) => zone.remove());
    this.verticalEdges.forEach((zone) => zone.remove());
    this.overlay.remove();
    this.transitionLayer.remove();
    this.stage.remove();
    this.wrapper.remove();
    this.container.classList.remove('game-mode');
    this.container.innerHTML = '';

    this.gameManager.destroy();
  }

  private createHorizontalEdgeZones(): void {
    (['left', 'right'] as SwipeEdge[]).forEach((edge) => {
      const zone = document.createElement('div');
      zone.className = `edge-swipe-zone horizontal edge-${edge}`;
      zone.style.setProperty('--edge-size', `${this.horizontalEdgeSize}px`);
      zone.setAttribute('role', 'button');
      zone.setAttribute('aria-label', edge === 'left' ? 'Предыдущая игра' : 'Следующая игра');
      zone.addEventListener('pointerdown', (event) => this.onPointerDown(event, 'horizontal', edge));
      this.wrapper.appendChild(zone);
      this.horizontalEdges.set(edge, zone);
    });
  }

  private createVerticalEdgeZones(): void {
    (['top', 'bottom'] as VerticalEdge[]).forEach((edge) => {
      const zone = document.createElement('div');
      zone.className = `edge-swipe-zone vertical edge-${edge}`;
      zone.style.setProperty('--edge-size', `${this.verticalEdgeSize}px`);
      zone.setAttribute('role', 'button');
      zone.setAttribute('aria-label', edge === 'top' ? 'Предыдущая игра' : 'Следующая игра');
      zone.addEventListener('pointerdown', (event) => this.onPointerDown(event, 'vertical', edge));
      this.wrapper.appendChild(zone);
      this.verticalEdges.set(edge, zone);
    });
  }

  private onPointerDown(
    event: PointerEvent,
    orientation: 'horizontal' | 'vertical',
    edge: SwipeEdge | VerticalEdge,
  ): void {
    if (this.games.length <= 1) {
      return;
    }

    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    this.activeSwipe = {
      id: event.pointerId,
      orientation,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      triggered: false,
    };

    if (orientation === 'vertical') {
      this.swipeHint.classList.add('swipe-hint--active');
    }
  }

  private onCenterPointerDown(event: PointerEvent): void {
    if (this.games.length <= 1 || this.isTransitioning) {
      return;
    }

    event.stopPropagation();
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    if (event.pointerType !== 'touch') {
      return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    this.centerPointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });

    if (this.centerPointers.size >= 2 && !this.centralSwipe) {
      const pointerIds = Array.from(this.centerPointers.keys()).slice(0, 2);
      this.centralSwipe = {
        pointerIds,
        startX: this.getAveragePointerValue(pointerIds, 'startX'),
        startY: this.getAveragePointerValue(pointerIds, 'startY'),
        triggered: false,
      };
    }
  }

  private onCenterPointerMove(event: PointerEvent): void {
    const trace = this.centerPointers.get(event.pointerId);
    if (!trace) {
      return;
    }

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    trace.currentX = event.clientX;
    trace.currentY = event.clientY;

    if (!this.centralSwipe || this.centralSwipe.triggered) {
      return;
    }

    if (!this.centralSwipe.pointerIds.every((id) => this.centerPointers.has(id))) {
      this.centralSwipe = undefined;
      return;
    }

    const avgCurrentY = this.getAveragePointerValue(this.centralSwipe.pointerIds, 'currentY');
    const avgCurrentX = this.getAveragePointerValue(this.centralSwipe.pointerIds, 'currentX');
    const deltaY = avgCurrentY - this.centralSwipe.startY;
    const deltaX = avgCurrentX - this.centralSwipe.startX;
    const dominantVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.4;

    if (!dominantVertical) {
      return;
    }

    if (deltaY > this.verticalSwipeThreshold) {
      this.centralSwipe.triggered = true;
      this.navigateWithTransition(-1, 'backward');
    } else if (deltaY < -this.verticalSwipeThreshold) {
      this.centralSwipe.triggered = true;
      this.navigateWithTransition(1, 'forward');
    }
  }

  private onCenterPointerUp(event: PointerEvent): void {
    const hadPointer = this.centerPointers.delete(event.pointerId);
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);

    if (!this.centralSwipe) {
      return;
    }

    if (!hadPointer) {
      return;
    }

    if (this.centralSwipe.pointerIds.includes(event.pointerId) || this.centerPointers.size < 2) {
      this.centralSwipe = undefined;
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.activeSwipe || event.pointerId !== this.activeSwipe.id || this.activeSwipe.triggered) {
      return;
    }

    const deltaX = event.clientX - this.activeSwipe.startX;
    const deltaY = event.clientY - this.activeSwipe.startY;
    const offset = this.resolveSwipe(this.activeSwipe, deltaX, deltaY);

    if (offset !== null) {
      this.activeSwipe.triggered = true;
      this.swipeHint.classList.add('swipe-hint--success');
      this.navigate(offset);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.activeSwipe || event.pointerId !== this.activeSwipe.id) {
      return;
    }

    try {
      const zone =
        this.activeSwipe.orientation === 'horizontal'
          ? this.horizontalEdges.get(this.activeSwipe.edge as SwipeEdge)
          : this.verticalEdges.get(this.activeSwipe.edge as VerticalEdge);
      zone?.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }

    this.swipeHint.classList.remove('swipe-hint--active', 'swipe-hint--success');
    this.activeSwipe = undefined;
  }

  private resolveSwipe(state: SwipeState, deltaX: number, deltaY: number): number | null {
    if (state.orientation === 'horizontal') {
      const dominantHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
      if (!dominantHorizontal) {
        return null;
      }

      if (state.edge === 'left' && deltaX > this.horizontalSwipeThreshold) {
        return -1;
      }

      if (state.edge === 'right' && deltaX < -this.horizontalSwipeThreshold) {
        return 1;
      }
    } else {
      const dominantVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
      if (!dominantVertical) {
        return null;
      }

      if (state.edge === 'top' && deltaY > this.verticalSwipeThreshold) {
        this.showVerticalHint();
        return -1;
      }

      if (state.edge === 'bottom' && deltaY < -this.verticalSwipeThreshold) {
        this.showVerticalHint();
        return 1;
      }
    }

    return null;
  }

  private async swapGame(index: number, direction: SwipeDirection): Promise<void> {
    if (this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;
    await this.showTransition(direction);
    await this.startGameAtIndex(index);
    await this.hideTransition();
    this.isTransitioning = false;
  }

  private async startGameAtIndex(index: number, options?: { immediate?: boolean }): Promise<void> {
    const game = this.games[index];
    if (!game) {
      return;
    }

    this.currentGameIndex = index;
    this.renderThumbs();
    this.updateHint(game.title);
    (window as unknown as { currentGameId?: string }).currentGameId = game.id;

    if (options?.immediate) {
      await this.gameManager.startGame(game, this.stageId);
      return;
    }

    await this.gameManager.startGame(game, this.stageId);
  }

  private renderThumbs(): void {
    this.thumbsContainer.innerHTML = '';
    if (!this.games.length) {
      return;
    }

    this.games.forEach((game, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-thumb';
      button.textContent = game.title;
      if (index === this.currentGameIndex) {
        button.classList.add('active');
      }
      button.addEventListener('click', () => {
        const offset = index - this.currentGameIndex;
        if (offset !== 0) {
          this.navigate(offset);
        }
      });
      this.thumbsContainer.appendChild(button);
    });
  }

  private updateHint(title?: string): void {
    if (this.games.length <= 1) {
      this.swipeHint.textContent = 'Добавьте ещё игры, чтобы использовать свайп';
      return;
    }

    const label = title ? `Игра: ${title}` : 'Свайпните у края экрана';
    this.swipeHint.textContent = `${label} · Свайпните у края экрана`;
  }

  private showEmptyState(): void {
    this.stage.innerHTML = `
      <div class="game-empty-state">
        <p>Нет доступных игр</p>
        <p>Создайте игру в главном меню</p>
      </div>
    `;
    this.swipeHint.textContent = 'Добавьте игру, чтобы начать';
    this.thumbsContainer.innerHTML = '';
  }

  private async showTransition(direction: SwipeDirection): Promise<void> {
    this.stage.classList.add('swipe-transition', direction === 'forward' ? 'swipe-up' : 'swipe-down');
    await this.wait(this.transitionDuration);
  }

  private async hideTransition(): Promise<void> {
    this.stage.classList.remove('swipe-up', 'swipe-down');
    await this.wait(this.transitionDuration);
  }

  private flashLimit(offset: number): void {
    const edge =
      offset > 0 ? this.verticalEdges.get('bottom') ?? this.horizontalEdges.get('right') : this.verticalEdges.get('top') ?? this.horizontalEdges.get('left');
    if (!edge) {
      return;
    }
    edge.classList.add('edge-swipe-zone--blocked');
    window.setTimeout(() => edge.classList.remove('edge-swipe-zone--blocked'), 240);
  }

  private showVerticalHint(): void {
    const now = Date.now();
    if (now - this.lastVerticalHint < this.verticalHintCooldown) {
      return;
    }

    this.lastVerticalHint = now;
    this.verticalHint.classList.add('visible');
    window.setTimeout(() => this.verticalHint.classList.remove('visible'), 1600);
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  private getAveragePointerValue(
    pointerIds: number[],
    key: 'startX' | 'startY' | 'currentX' | 'currentY',
  ): number {
    if (!pointerIds.length) {
      return 0;
    }
    const sum = pointerIds.reduce((acc, id) => {
      const trace = this.centerPointers.get(id);
      if (!trace) {
        return acc;
      }
      return acc + trace[key];
    }, 0);
    return sum / pointerIds.length;
  }
}


