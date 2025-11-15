import { MainScreen } from './ui/MainScreen';
import { GameManager } from './core/GameManager';
import { GameContainer } from './core/GameContainer';
import type { GeneratedGame } from './types';
import { GameStorage } from './storage/GameStorage';

let mainScreen: MainScreen;
let gameManager: GameManager;
let gameContainer: GameContainer | null = null;

function renderMainScreen(): void {
  mainScreen = new MainScreen('app');
}

function init(): void {
  // Инициализируем главный экран
  renderMainScreen();

  // Инициализируем менеджер игр
  gameManager = new GameManager();

  // Обработчик запуска игры
  window.addEventListener('playGame', ((e: CustomEvent<GeneratedGame>) => {
    const game = e.detail;
    startGame(game);
  }) as EventListener);

  // Обработчик завершения игры
  gameManager.setOnGameEnd(handleGameEnd);
}

function startGame(game: GeneratedGame): void {
  const games = GameStorage.getAllGames();
  if (!games.length) {
    return;
  }

  if (!gameContainer) {
    gameContainer = new GameContainer({
      containerId: 'app',
      gameManager,
      onExit: teardownGameSession,
    });
  }

  gameContainer.setGames(games, game.id);
}

function handleGameEnd(score: number, rewards: number): void {
  const currentId = (window as unknown as { currentGameId?: string }).currentGameId || '';
  const currentGame = GameStorage.getGame(currentId);

  if (currentGame) {
    currentGame.score = score;
    if (score > currentGame.highScore) {
      currentGame.highScore = score;
    }
    currentGame.rewards += rewards;
    GameStorage.saveGame(currentGame);
  }

  teardownGameSession();
}

function teardownGameSession(): void {
  if (gameContainer) {
    gameContainer.destroy();
    gameContainer = null;
  }
  renderMainScreen();
}

// Запускаем приложение
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

