/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Orquestador Principal (main.js)
 * ---------------------------------------------------------------
 * Conecta los sistemas del juego principal incluyendo:
 *  - Progresión de 5 niveles de intensidad cada 1000 metros
 *  - Gatillos sensibles y masheo de B sobre obstáculos multicapa
 *  - Apartado de Música sincronizada con la carrera (MusicManager)
 */
window.PSR = window.PSR || {};

class GameApp {
    constructor() {
        this.config = window.PSR.GameConfig;
        this.eventBus = new window.PSR.EventBus();

        this.canvas = document.getElementById('game-canvas');
        this.input = new window.PSR.InputManager(this.eventBus, this.config);
        this.player = new window.PSR.Player(this.config, this.eventBus);
        this.obstacleManager = new window.PSR.ObstacleManager(this.config, this.eventBus);
        this.interactionSystem = new window.PSR.InteractionSystem(this.config, this.eventBus);
        this.collisionSystem = new window.PSR.CollisionSystem(this.config, this.eventBus);
        this.renderer = new window.PSR.Renderer(this.canvas, this.config, this.eventBus);
        this.musicManager = window.PSR.MusicManager
            ? new window.PSR.MusicManager(this.eventBus, this.config)
            : null;

        this.bestDistance = 0;
        this.lastActionFeedback = 'MANTÉN [A] PARA CORRER';
        this.deathTimestamp = 0;

        this._cacheHudElements();
        this._bindSystemEvents();
        this.resetRun();

        this.loop = new window.PSR.GameLoop(
            (dt, now) => this.update(dt, now),
            (dt, now) => this.render(dt, now)
        );
        this.loop.start();
    }

    _cacheHudElements() {
        this.uiDistance = document.getElementById('hud-distance');
        this.uiBest = document.getElementById('hud-best');
        this.uiLane = document.getElementById('hud-lane');
        this.uiLevelName = document.getElementById('hud-level-name');
        this.uiLevelProgressFill = document.getElementById('hud-level-progress-fill');
        this.uiControlA = document.getElementById('hud-control-a');
        this.uiControlB = document.getElementById('hud-control-b');
        this.uiPursuitBar = document.getElementById('hud-pursuit-fill');
        this.uiFeedback = document.getElementById('hud-feedback');

        this.deathOverlay = document.getElementById('death-overlay');
        this.deathReasonEl = document.getElementById('death-reason');
        this.deathDetailEl = document.getElementById('death-detail');
        this.deathScoreEl = document.getElementById('death-score');
    }

    _bindSystemEvents() {
        this.eventBus.on('input:lane_change', ({ type, targetLane }) => {
            if (!this.player.isAlive) return;
            this.player.setTargetLane(targetLane, type);
            this.input.syncLane(targetLane);

            const laneName = this.config.LANES.NAMES[targetLane];
            if (type === 'SINGLE_TAP_NEXT') {
                this.lastActionFeedback = `1 TOQUE [A] → ${laneName}`;
            } else {
                this.lastActionFeedback = `2 TOQUES [A] → ${laneName}`;
            }
        });

        this.eventBus.on('input:lane_switch_unlocked', () => {
            if (!this.player.isAlive) return;
            this.lastActionFeedback = '[A] SUELTA: CAMBIO DE CARRIL HABILITADO (1 o 2 TOQUES)';
        });

        this.eventBus.on('input:b_action', () => {
            if (!this.player.isAlive) {
                if (performance.now() - this.deathTimestamp > 350) {
                    this.resetRun();
                }
                return;
            }
            this.interactionSystem.executeContextualAction(
                this.player,
                this.obstacleManager.obstacles
            );
        });

        this.eventBus.on('interaction:mash_hit', ({ remainingHits, requiredHits }) => {
            this.lastActionFeedback = `⚡ ¡IMPACTO [B]! ¡SIGUE MASHEANDO! (Quedan ${remainingHits}/${requiredHits})`;
        });

        this.eventBus.on('interaction:manipulated', ({ toLane }) => {
            const targetName = this.config.LANES.NAMES[toLane];
            this.lastActionFeedback = `💥 [B] ESTRUCTURA DERRUMBADA HACIA ${targetName}`;
        });

        this.eventBus.on('interaction:shattered', () => {
            this.lastActionFeedback = '💥 [B] BARRICADA DESTROZADA AL PASO';
        });

        this.eventBus.on('interaction:resisted', () => {
            this.lastActionFeedback = '🛡️ [B] INÚTIL: MONOLITO INDESTRUCTIBLE — ESQUIVA CON [A]';
        });

        this.eventBus.on('difficulty:level_up', ({ level, config }) => {
            this.lastActionFeedback = `🔥 ¡${config.name}! (${config.subtitle})`;
        });

        this.eventBus.on('input:a_down', ({ timestamp }) => {
            if (!this.player.isAlive && timestamp - this.deathTimestamp > 400) {
                this.resetRun();
            }
        });

        this.eventBus.on('input:restart', () => {
            this.resetRun();
        });

        this.eventBus.on('player:died', ({ reason, detail, distance }) => {
            this.deathTimestamp = performance.now();
            if (distance > this.bestDistance) {
                this.bestDistance = distance;
            }
            if (this.deathReasonEl) this.deathReasonEl.textContent = reason;
            if (this.deathDetailEl) this.deathDetailEl.textContent = detail;
            if (this.deathScoreEl) {
                this.deathScoreEl.textContent = `DISTANCIA: ${distance} m (NIVEL ${this.obstacleManager.currentLevel}/5)  |  RÉCORD: ${this.bestDistance} m`;
            }
            if (this.deathOverlay) this.deathOverlay.classList.remove('hidden');
        });
    }

    resetRun() {
        this.player.reset();
        this.input.reset(this.player.lane);
        this.obstacleManager.reset();
        if (this.deathOverlay) this.deathOverlay.classList.add('hidden');
        this.lastActionFeedback = 'NIVEL 1/5: MANTÉN [A] PARA CORRER — MASHEA [B] PARA ROMPER/EMPUJAR';
    }

    update(dt, now) {
        this.input.update(now);

        if (this.player.isAlive) {
            this.player.update(dt, now, this.input.isHoldingA);
            this.obstacleManager.update(dt, this.player);
            this.collisionSystem.update(this.player, this.obstacleManager.obstacles);
        }

        if (this.musicManager) {
            this.musicManager.update(this.player, this.obstacleManager.currentLevel);
        }

        this._updateHud(now);
    }

    render(dt, now) {
        this.renderer.render(dt, now, {
            player: this.player,
            obstacles: this.obstacleManager.obstacles,
            inputState: this.input.getControlState(now)
        });
    }

    _updateHud(now) {
        const distMeters = Math.floor(this.player.z / 10);
        if (distMeters > this.bestDistance) {
            this.bestDistance = distMeters;
        }

        if (this.uiDistance) this.uiDistance.textContent = `${distMeters} m`;
        if (this.uiBest) this.uiBest.textContent = `${this.bestDistance} m`;
        if (this.uiLane) this.uiLane.textContent = this.config.LANES.NAMES[this.player.lane];

        // Progreso de los 5 Niveles (cada 1000m)
        const lvl = this.obstacleManager.currentLevel;
        const lvlCfg = this.obstacleManager.getLevelConfig(lvl);
        if (this.uiLevelName) {
            this.uiLevelName.textContent = `${lvlCfg.name} (${lvl}/5)`;
        }
        if (this.uiLevelProgressFill) {
            const metersPerLvl = this.config.DIFFICULTY.METERS_PER_LEVEL || 1000;
            const pct = lvl >= 5 ? 100 : ((distMeters % metersPerLvl) / metersPerLvl) * 100;
            this.uiLevelProgressFill.style.width = `${pct}%`;
        }

        const ctrl = this.input.getControlState(now);
        if (this.uiControlA) {
            if (ctrl.isHoldingA) {
                this.uiControlA.textContent = `A: CORRIENDO (${Math.round(this.player.speed)} u/s)`;
                this.uiControlA.className = 'pill active-run';
            } else if (ctrl.laneSwitchReady) {
                this.uiControlA.textContent = 'A: CAMBIO LISTO (1 o 2 TOQUES)';
                this.uiControlA.className = 'pill switch-ready';
            } else {
                this.uiControlA.textContent = 'A: DETENIDO (MANTÉN A)';
                this.uiControlA.className = 'pill idle';
            }
        }

        if (this.uiControlB) {
            if (this.player.bActionTimer > 0 || ctrl.bMashRate > 0) {
                this.uiControlB.textContent = `B: ${this.player.bLastOutcome} (${ctrl.bMashRate} puls/s)`;
                this.uiControlB.className = 'pill active-b';
            } else {
                this.uiControlB.textContent = 'B: MASHEO CONTEXTUAL';
                this.uiControlB.className = 'pill idle';
            }
        }

        if (this.uiPursuitBar) {
            const pursuitPct = Math.max(0, Math.min(100, (this.player.pursuitDistance / this.config.PURSUIT.INITIAL_DISTANCE) * 100));
            this.uiPursuitBar.style.width = `${pursuitPct}%`;
            this.uiPursuitBar.style.backgroundColor = pursuitPct < 40 ? '#ff1e38' : '#e2e8f0';
        }

        if (this.uiFeedback) {
            this.uiFeedback.textContent = this.lastActionFeedback;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.PSR.app = new GameApp();
});
