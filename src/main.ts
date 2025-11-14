import { MainScreen } from './ui/MainScreen';
import { GameManager } from './core/GameManager';
import type { GeneratedGame } from './types';
import { GameStorage } from './storage/GameStorage';

let mainScreen: MainScreen;
let gameManager: GameManager;

function init(): void {
  // Инициализируем главный экран
  mainScreen = new MainScreen('app');

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
    setTimeout(() => {
      const app = document.getElementById('app');
      if (app) {
        // Восстанавливаем стили для главного экрана
        app.style.padding = '';
        app.style.margin = '';
      }
      mainScreen = new MainScreen('app');
    }, 1000);
  });
}

function startGame(game: GeneratedGame): void {
  // Сохраняем ID текущей игры
  (window as unknown as { currentGameId?: string }).currentGameId = game.id;

  // Очищаем контейнер и убираем padding для полноэкранной игры
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '';
    app.style.padding = '0';
    app.style.margin = '0';
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

