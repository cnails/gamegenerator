import { MainScreen } from './ui/MainScreen';
import { GameManager } from './core/GameManager';
import type { GeneratedGame } from './types';
import { GameStorage } from './storage/GameStorage';

let mainScreen: MainScreen;
let gameManager: GameManager;

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
  gameManager.setOnGameEnd((score, rewards) => {
    const game = GameStorage.getGame((window as unknown as { currentGameId?: string }).currentGameId || '');
    if (game) {
      game.score = score;
      if (score > game.highScore) {
        game.highScore = score;
      }
      game.rewards += rewards;
      GameStorage.saveGame(game);
    }

    // Возвращаемся на главный экран
    renderMainScreen();
  });
}

function startGame(game: GeneratedGame): void {
  // Сохраняем ID текущей игры
  (window as unknown as { currentGameId?: string }).currentGameId = game.id;

  // Очищаем контейнер
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '';
    app.classList.add('game-mode');
  }

  // Запускаем игру
  gameManager.startGame(game, 'app');
}

// Запускаем приложение
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

