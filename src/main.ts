import './style.css'
import Phaser from 'phaser'

import { PlayScene } from './scenes/PlayScene'

declare global {
  interface Window {
    __PHASER_GAME__?: Phaser.Game | null
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 600,
  parent: 'app',
  backgroundColor: '#020617',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [PlayScene],
}

window.__PHASER_GAME__?.destroy(true)
window.__PHASER_GAME__ = new Phaser.Game(config)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.__PHASER_GAME__?.destroy(true)
    window.__PHASER_GAME__ = null
  })
}
