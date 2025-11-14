import type { GeneratedGame, GameTemplate, Difficulty, GameConfig } from '@/types';
import { GameStorage } from '@/storage/GameStorage';
import { gameTemplates } from '@/templates';
import { ChatGPTAPI } from '@/api/chatgpt';

export class MainScreen {
  private container: HTMLElement;
  private games: GeneratedGame[] = [];
  private chatGPTAPI: ChatGPTAPI;

  constructor(containerId: string = 'app') {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    this.container = container;
    this.chatGPTAPI = new ChatGPTAPI();
    this.loadGames();
    this.render();
  }

  setApiKey(apiKey: string): void {
    this.chatGPTAPI.setApiKey(apiKey);
  }

  private loadGames(): void {
    this.games = GameStorage.getAllGames();
  }

  private render(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
      <h1>🎮 Game Generator</h1>
      <div class="rewards">Награды: ${GameStorage.getTotalRewards()}</div>
    `;

    const content = document.createElement('div');
    content.className = 'content';

    const gamesList = this.createGamesList();
    const generatorPanel = this.createGeneratorPanel();

    content.appendChild(gamesList);
    content.appendChild(generatorPanel);

    this.container.appendChild(header);
    this.container.appendChild(content);

    this.attachEventListeners();
  }

  private createGamesList(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'games-section';

    const title = document.createElement('h2');
    title.textContent = 'Мои игры';

    const list = document.createElement('div');
    list.className = 'games-list';

    if (this.games.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Пока нет игр. Создайте новую!';
      list.appendChild(empty);
    } else {
      this.games.forEach((game) => {
        const card = this.createGameCard(game);
        list.appendChild(card);
      });
    }

    section.appendChild(title);
    section.appendChild(list);

    return section;
  }

  private createGameCard(game: GeneratedGame): HTMLElement {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="game-card-header">
        <h3>${game.title}</h3>
        <button class="delete-btn" data-id="${game.id}">✕</button>
      </div>
      <div class="game-card-body">
        <div class="game-info">
          <span class="template-badge">${this.getTemplateName(game.template)}</span>
          <span class="difficulty-badge ${game.difficulty}">${this.getDifficultyName(game.difficulty)}</span>
        </div>
        <div class="game-stats">
          <div>Рекорд: ${game.highScore}</div>
          <div>Награды: ${game.rewards}</div>
        </div>
      </div>
      <button class="play-btn" data-id="${game.id}">Играть</button>
    `;

    return card;
  }

  private createGeneratorPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'generator-panel';

    panel.innerHTML = `
      <h2>Создать новую игру</h2>
      
      <div class="form-group">
        <label>Шаблон игры</label>
        <select id="template-select" class="form-control">
          ${gameTemplates.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Сложность</label>
        <select id="difficulty-select" class="form-control">
          <option value="easy">Легкая</option>
          <option value="medium" selected>Средняя</option>
          <option value="hard">Сложная</option>
        </select>
      </div>

      <div id="params-container" class="params-container"></div>

      <div class="form-group">
        <label>API ключ ChatGPT (опционально)</label>
        <input type="password" id="api-key-input" class="form-control" placeholder="sk-...">
        <small>Если не указан, будут использованы значения по умолчанию</small>
      </div>

      <button id="generate-btn" class="generate-btn">🎲 Сгенерировать игру</button>
      <div id="generation-status" class="generation-status"></div>
    `;

    return panel;
  }

  private attachEventListeners(): void {
    // Обновление параметров при смене шаблона
    const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
    templateSelect?.addEventListener('change', () => {
      this.updateParamsFields();
    });

    // Генерация игры
    const generateBtn = document.getElementById('generate-btn');
    generateBtn?.addEventListener('click', () => {
      this.generateGame();
    });

    // Удаление игры
    this.container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) {
          this.deleteGame(id);
        }
      });
    });

    // Запуск игры
    this.container.querySelectorAll('.play-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id;
        if (id) {
          this.playGame(id);
        }
      });
    });

    // Инициализация полей параметров
    this.updateParamsFields();
  }

  private updateParamsFields(): void {
    const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
    const paramsContainer = document.getElementById('params-container');
    if (!templateSelect || !paramsContainer) return;

    const templateId = templateSelect.value as GameTemplate;
    const template = gameTemplates.find((t) => t.id === templateId);

    if (!template) return;

    paramsContainer.innerHTML = '';

    template.paramFields.forEach((field) => {
      const group = document.createElement('div');
      group.className = 'form-group';

      const label = document.createElement('label');
      label.textContent = field.label;

      let input: HTMLElement;

      if (field.type === 'number') {
        input = document.createElement('input');
        (input as HTMLInputElement).type = 'number';
        (input as HTMLInputElement).value = String(field.defaultValue);
        if (field.min !== undefined) (input as HTMLInputElement).min = String(field.min);
        if (field.max !== undefined) (input as HTMLInputElement).max = String(field.max);
      } else if (field.type === 'select') {
        input = document.createElement('select');
        field.options?.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          (input as HTMLSelectElement).appendChild(option);
        });
      } else {
        input = document.createElement('input');
        (input as HTMLInputElement).type = field.type;
        (input as HTMLInputElement).value = String(field.defaultValue);
      }

      input.className = 'form-control';
      input.id = `param-${field.key}`;

      group.appendChild(label);
      group.appendChild(input);
      paramsContainer.appendChild(group);
    });
  }

  private async generateGame(): Promise<void> {
    const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
    const difficultySelect = document.getElementById('difficulty-select') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    const statusDiv = document.getElementById('generation-status');
    const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;

    if (!templateSelect || !difficultySelect) return;

    const template = templateSelect.value as GameTemplate;
    const difficulty = difficultySelect.value as Difficulty;

    // Собираем параметры
    const templateDef = gameTemplates.find((t) => t.id === template);
    if (!templateDef) return;

    const params: Record<string, unknown> = {};
    templateDef.paramFields.forEach((field) => {
      const input = document.getElementById(`param-${field.key}`) as HTMLInputElement | HTMLSelectElement;
      if (input) {
        if (field.type === 'number') {
          params[field.key] = Number((input as HTMLInputElement).value);
        } else {
          params[field.key] = input.value;
        }
      } else {
        params[field.key] = field.defaultValue;
      }
    });

    const config: GameConfig = {
      template,
      difficulty,
      params,
    };

    // Обновляем UI
    if (statusDiv) {
      statusDiv.textContent = 'Генерация игры...';
      statusDiv.className = 'generation-status loading';
    }
    if (generateBtn) {
      generateBtn.disabled = true;
    }

    try {
      // Устанавливаем API ключ если указан
      const apiKey = apiKeyInput?.value.trim();
      if (apiKey) {
        this.chatGPTAPI.setApiKey(apiKey);
      }

      // Генерируем данные игры через ChatGPT
      let gameData;
      try {
        gameData = await this.chatGPTAPI.generateGame(config);
      } catch (error) {
        console.warn('ChatGPT API error, using defaults:', error);
        gameData = null;
      }

      // Создаем игру
      const game: GeneratedGame = {
        id: `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: gameData?.title || `${templateDef.name} ${new Date().toLocaleDateString()}`,
        template,
        difficulty,
        score: 0,
        highScore: 0,
        rewards: 0,
        createdAt: Date.now(),
        config,
        gameData: gameData || undefined,
      };

      GameStorage.saveGame(game);
      this.loadGames();
      this.render();

      if (statusDiv) {
        statusDiv.textContent = 'Игра успешно создана!';
        statusDiv.className = 'generation-status success';
      }
    } catch (error) {
      console.error('Generation error:', error);
      if (statusDiv) {
        statusDiv.textContent = `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
        statusDiv.className = 'generation-status error';
      }
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
      }
    }
  }

  private deleteGame(id: string): void {
    if (confirm('Удалить эту игру?')) {
      GameStorage.deleteGame(id);
      this.loadGames();
      this.render();
    }
  }

  private playGame(id: string): void {
    const game = GameStorage.getGame(id);
    if (!game) return;

    // Эмитируем событие для запуска игры
    const event = new CustomEvent('playGame', { detail: game });
    window.dispatchEvent(event);
  }

  private getTemplateName(template: GameTemplate): string {
    return gameTemplates.find((t) => t.id === template)?.name || template;
  }

  private getDifficultyName(difficulty: Difficulty): string {
    const names: Record<Difficulty, string> = {
      easy: 'Легкая',
      medium: 'Средняя',
      hard: 'Сложная',
    };
    return names[difficulty] || difficulty;
  }
}

