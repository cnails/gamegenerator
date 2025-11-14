import Phaser from 'phaser'

type PhysicsArc = Phaser.GameObjects.Arc & {
  body: Phaser.Physics.Arcade.Body
}

type StaticRectangle = Phaser.GameObjects.Rectangle & {
  body: Phaser.Physics.Arcade.StaticBody
}

type DynamicRectangle = Phaser.GameObjects.Rectangle & {
  body: Phaser.Physics.Arcade.Body
}

const GAME_WIDTH = 960
const GAME_HEIGHT = 600

export class PlayScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyboard!: Phaser.Input.Keyboard.KeyboardPlugin
  private player!: PhysicsArc
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private hazards!: Phaser.Physics.Arcade.Group
  private solidHazards!: Phaser.Physics.Arcade.Group
  private goalZone!: StaticRectangle
  private timerText!: Phaser.GameObjects.Text
  private recordText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private elapsedStart = 0
  private bestTime = Number.POSITIVE_INFINITY
  private gameOver = false
  private fallingTimer?: Phaser.Time.TimerEvent

  constructor() {
    super('PlayScene')
  }

  preload(): void {
    // No assets yet – we draw everything with primitives.
  }

  create(): void {
    this.addBackground()

    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard plugin is not available')
    }

    this.keyboard = keyboard
    this.cursors = keyboard.createCursorKeys()

    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT, true, true, true, true)
    this.platforms = this.physics.add.staticGroup()
    this.buildPlatforms()

    this.player = this.buildPlayer()
    this.createGoal()

    this.hazards = this.physics.add.group()
    this.solidHazards = this.physics.add.group()
    this.buildMovingHazards()
    this.buildCeilingSweepers()
    this.startFallingHazards()

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.solidHazards, this.platforms)
    this.physics.add.collider(this.solidHazards, this.solidHazards)

    this.physics.add.overlap(
      this.player,
      this.hazards,
      () => this.onPlayerHit(),
      undefined,
      this,
    )
    this.physics.add.overlap(
      this.player,
      this.goalZone,
      () => this.onGoalReached(),
      undefined,
      this,
    )

    this.createHud()
    this.registerInputs()

    this.elapsedStart = this.time.now
  }

  update(): void {
    if (this.gameOver) {
      return
    }

    this.handleMovement()
    this.updateTimer()
    this.cleanupHazards()
  }

  private addBackground(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x030712)
      .setDepth(-5)

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0f172a, 0.4)
      .setDepth(-4)

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 80, GAME_WIDTH, 160, 0x111827, 0.6).setDepth(-3)
  }

  private buildPlatforms(): void {
    const segments = [
      { x: 480, y: 580, width: 980, height: 38 },
      { x: 180, y: 470, width: 220, height: 20 },
      { x: 420, y: 410, width: 180, height: 20 },
      { x: 700, y: 360, width: 240, height: 20 },
      { x: 320, y: 300, width: 160, height: 18 },
      { x: 120, y: 250, width: 140, height: 18 },
      { x: 560, y: 230, width: 200, height: 18 },
      { x: 840, y: 220, width: 140, height: 18 },
      { x: 260, y: 150, width: 200, height: 16 },
    ]

    segments.forEach((segment) => {
      const platform = this.add.rectangle(segment.x, segment.y, segment.width, segment.height, 0x1e2a3f) as StaticRectangle
      platform.setStrokeStyle(2, 0x30445f, 0.8)
      this.physics.add.existing(platform, true)
      this.platforms.add(platform)
    })
  }

  private buildPlayer(): PhysicsArc {
    const player = this.add.circle(80, 520, 18, 0x4fd1c5) as PhysicsArc
    this.physics.add.existing(player)

    const body = player.body
    body.setCircle(18)
    body.setBounce(0.25)
    body.setCollideWorldBounds(true)
    body.setDrag(220, 0)
    body.setMaxVelocity(360, 900)
    body.setDamping(true)
    return player
  }

  private createGoal(): void {
    const glow = this.add
      .ellipse(860, 125, 140, 70, 0x22d3ee, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.2, to: 0.65 },
      scaleX: { from: 1, to: 1.05 },
      ease: 'Sine.easeInOut',
      duration: 1200,
      yoyo: true,
      repeat: -1,
    })

    this.add
      .ellipse(860, 125, 88, 36, 0x0ea5e9, 0.85)
      .setStrokeStyle(4, 0x7dd3fc, 0.7)
      .setBlendMode(Phaser.BlendModes.SCREEN)

    const hitbox = this.add.rectangle(860, 125, 92, 54, 0xffffff, 0) as StaticRectangle
    this.physics.add.existing(hitbox, true)
    hitbox.body.updateFromGameObject()
    this.goalZone = hitbox
  }

  private buildMovingHazards(): void {
    const lanes = [
      { x: 320, y: 520, width: 36, height: 36, speed: 160 },
      { x: 640, y: 520, width: 36, height: 36, speed: 200 },
      { x: 280, y: 330, width: 28, height: 28, speed: 140 },
      { x: 760, y: 330, width: 28, height: 28, speed: 170 },
      { x: 500, y: 190, width: 24, height: 24, speed: 210 },
    ]

    lanes.forEach((lane, index) => {
      const hazard = this.add.rectangle(lane.x, lane.y, lane.width, lane.height, 0xff5964) as DynamicRectangle
      hazard.setStrokeStyle(2, 0xffffff, 0.35)
      this.physics.add.existing(hazard)

      const body = hazard.body
      body.setAllowGravity(false)
      body.setImmovable(true)
      body.setVelocityX(index % 2 === 0 ? lane.speed : -lane.speed)
      body.setBounce(1, 0)
      body.setCollideWorldBounds(true)
      body.onWorldBounds = true

      this.hazards.add(hazard)
      this.solidHazards.add(hazard)
    })
  }

  private buildCeilingSweepers(): void {
    const sweepers = [
      { x: 160, y: 150, width: 46, height: 20, speed: 210 },
      { x: 520, y: 175, width: 38, height: 18, speed: -250 },
      { x: 820, y: 150, width: 44, height: 20, speed: 190 },
    ]

    sweepers.forEach((config, index) => {
      const sweeper = this.add.rectangle(config.x, config.y, config.width, config.height, 0xf97316) as DynamicRectangle
      sweeper.setStrokeStyle(2, 0xffffff, 0.4)
      sweeper.setAlpha(0.9)
      this.physics.add.existing(sweeper)

      const body = sweeper.body
      body.setAllowGravity(false)
      body.setImmovable(true)
      body.setVelocityX(index % 2 === 0 ? config.speed : -config.speed)
      body.setBounce(1, 0)
      body.setCollideWorldBounds(true)

      this.hazards.add(sweeper)
      this.solidHazards.add(sweeper)
    })
  }

  private startFallingHazards(): void {
    this.stopFallingHazards()
    this.fallingTimer = this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => this.dropFallingHazard(),
    })
  }

  private stopFallingHazards(): void {
    this.fallingTimer?.remove(false)
    this.fallingTimer = undefined
  }

  private dropFallingHazard(): void {
    const offset = Phaser.Math.Between(-70, 70)
    const targetX = Phaser.Math.Clamp(this.player.x + offset, 60, GAME_WIDTH - 60)
    const size = Phaser.Math.Between(20, 30)
    const hazard = this.add.rectangle(targetX, -30, size, size * 1.6, 0x7c3aed, 0.85) as DynamicRectangle
    hazard.setStrokeStyle(2, 0xffffff, 0.3)
    this.physics.add.existing(hazard)

    const body = hazard.body
    body.setVelocity(Phaser.Math.Between(-30, 30), Phaser.Math.Between(160, 220))
    body.setAngularVelocity(Phaser.Math.Between(-180, 180))
    body.setAllowGravity(true)

    this.hazards.add(hazard)
  }

  private handleMovement(): void {
    const body = this.player.body
    const moveSpeed = 320

    if (this.cursors.left?.isDown) {
      body.setVelocityX(-moveSpeed)
      this.player.rotation -= 0.08
    } else if (this.cursors.right?.isDown) {
      body.setVelocityX(moveSpeed)
      this.player.rotation += 0.08
    } else {
      body.setVelocityX(body.velocity.x * 0.9)
    }

    const wantsJump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      (this.cursors.space ? Phaser.Input.Keyboard.JustDown(this.cursors.space) : false)

    if (wantsJump && (body.blocked.down || body.touching.down)) {
      body.setVelocityY(-480)
      this.player.rotation += 0.25 * Math.sign(body.velocity.x || 1)
    }
  }

  private updateTimer(force = false): number {
    const elapsed = Math.max(0, (this.time.now - this.elapsedStart) / 1000)
    if (!this.gameOver || force) {
      this.timerText.setText(`Время: ${elapsed.toFixed(2)}c`)
    }
    return elapsed
  }

  private cleanupHazards(): void {
    this.hazards.getChildren().forEach((child) => {
      const hazard = child as DynamicRectangle
      if (
        hazard.y > GAME_HEIGHT + 80 ||
        hazard.x < -80 ||
        hazard.x > GAME_WIDTH + 80
      ) {
        hazard.destroy()
      }
    })
  }

  private createHud(): void {
    this.add
      .text(24, 24, 'Rolling Shift', {
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        fontSize: '24px',
        color: '#f8fafc',
      })
      .setShadow(0, 0, '#0f172a', 8)
      .setScrollFactor(0)

    this.timerText = this.add
      .text(24, 60, 'Время: 0.00c', {
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        fontSize: '18px',
        color: '#a5f3fc',
      })
      .setScrollFactor(0)

    this.recordText = this.add
      .text(24, 86, 'Лучшее время: —', {
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        fontSize: '16px',
        color: '#fef08a',
      })
      .setScrollFactor(0)
    this.updateRecordLabel()

    this.statusText = this.add
      .text(
        24,
        GAME_HEIGHT - 40,
        'Цель: доберись до портала сверху справа. Стрелки — движение, Space — прыжок, R — рестарт.',
        {
          fontFamily: 'Space Grotesk, Inter, sans-serif',
          fontSize: '18px',
          color: '#cbd5f5',
        },
      )
      .setScrollFactor(0)
  }

  private updateRecordLabel(): void {
    const label = Number.isFinite(this.bestTime) ? `${this.bestTime.toFixed(2)}c` : '—'
    this.recordText.setText(`Лучшее время: ${label}`)
  }

  private registerInputs(): void {
    this.keyboard.on('keydown-R', () => {
      if (this.gameOver) {
        this.resetRun()
      }
    })
  }

  private onPlayerHit(): void {
    if (this.gameOver) {
      return
    }

    this.gameOver = true
    this.stopFallingHazards()
    this.updateTimer(true)

    this.statusText.setText('Ты разбился! Нажми R, чтобы попробовать снова и добраться до портала.')
    const body = this.player.body
    body.setVelocity(0)
    body.setAcceleration(0)
    this.player.setFillStyle(0xff5964)
  }

  private onGoalReached(): void {
    if (this.gameOver) {
      return
    }

    this.gameOver = true
    this.stopFallingHazards()
    const elapsed = this.updateTimer(true)

    if (!Number.isFinite(this.bestTime) || elapsed < this.bestTime) {
      this.bestTime = elapsed
      this.updateRecordLabel()
    }

    this.statusText.setText('Победа! Нажми R, чтобы улучшить результат и найти ещё лучший маршрут.')
    const body = this.player.body
    body.setVelocity(0)
    body.setAcceleration(0)
    body.setAngularVelocity(0)
    this.player.setFillStyle(0xa855f7)
  }

  private resetRun(): void {
    this.gameOver = false
    this.statusText.setText('Цель: доберись до портала сверху справа и избегай ловушек!')

    this.player.setFillStyle(0x4fd1c5)
    this.player.setPosition(80, 520)
    this.player.setRotation(0)
    const body = this.player.body
    body.setVelocity(0)
    body.setAcceleration(0)
    body.setAngularVelocity(0)

    this.stopFallingHazards()
    this.hazards.clear(true, true)
    this.solidHazards.clear(false, false)
    this.buildMovingHazards()
    this.buildCeilingSweepers()
    this.startFallingHazards()

    this.elapsedStart = this.time.now
    this.updateTimer(true)
  }
}

