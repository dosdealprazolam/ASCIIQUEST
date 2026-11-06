/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Orquestador Principal (main.js)
 * ---------------------------------------------------------------
 * Conecta de forma limpia los sistemas modulares de la Fase 1:
 *  - InputManager (Dos controles: A y B)
 *  - Player (Movimiento en 3 carriles y presión de persecución)
 *  - ObstacleManager (Generación de obstáculos y estructuras interactivas)
 *  - InteractionSystem (Manipulación contextual del entorno con B)
 *  - CollisionSystem (Detección de impactos y diagnóstico de muerte)
 *  - Renderer (Visualización 2.5D oscura + HUD minimalista)
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
        // Cambio de carril con Control A (1 toque = siguiente, 2 toques = anterior)
        this.eventBus.on('input:lane_change', ({ type, targetLane }) => {
            if (!this.player.isAlive) return;
            this.player.setTargetLane(targetLane, type);
            this.input.syncLane(targetLane);

            const laneName = this.config.LANES.NAMES[targetLane];
            if (type === 'SINGLE_TAP_NEXT') {
                this.lastActionFeedback = `1 TOQUE [A] → CARRIL SIGUIENTE (${laneName})`;
            } else {
                this.lastActionFeedback = `2 TOQUES [A] → CARRIL ANTERIOR (${laneName})`;
            }
        });

        this.eventBus.on('input:lane_switch_unlocked', () => {
            if (!this.player.isAlive) return;
            this.lastActionFeedback = '[A] SUELTA: CAMBIO DE CARRIL HABILITADO (1 o 2 TOQUES)';
        });

        // Acción contextual con Control B
        this.eventBus.on('input:b_action', () => {
            if (!this.player.isAlive) {
                // Permitir reiniciar rápidamente tras morir
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

        this.eventBus.on('interaction:manipulated', ({ toLane }) => {
            const targetName = this.config.LANES.NAMES[toLane];
            this.lastActionFeedback = `[B] ESTRUCTURA DERRUMBADA HACIA ${targetName}`;
        });

        this.eventBus.on('interaction:shattered', () => {
            this.lastActionFeedback = '[B] BARRICADA DESTROZADA AL PASO';
        });

        this.eventBus.on('interaction:resisted', () => {
            this.lastActionFeedback = '[B] INÚTIL: ESTRUCTURA MACIZA — CAMBIA DE CARRIL CON [A]';
        });

        // Reinicio rápido con A o R cuando el jugador ha muerto
        this.eventBus.on('input:a_down', ({ timestamp }) => {
            if (!this.player.isAlive && timestamp - this.deathTimestamp > 400) {
                this.resetRun();
            }
        });

        this.eventBus.on('input:restart', () => {
            this.resetRun();
        });

        // Evento de muerte
        this.eventBus.on('player:died', ({ reason, detail, distance }) => {
            this.deathTimestamp = performance.now();
            if (distance > this.bestDistance) {
                this.bestDistance = distance;
            }
            this.deathReasonEl.textContent = reason;
            this.deathDetailEl.textContent = detail;
            this.deathScoreEl.textContent = `DISTANCIA SOBREVIVIDA: ${distance} m  |  RÉCORD: ${this.bestDistance} m`;
            this.deathOverlay.classList.remove('hidden');
        });
    }

    resetRun() {
        this.player.reset();
        this.input.reset(this.player.lane);
        this.obstacleManager.reset();
        this.deathOverlay.classList.add('hidden');
        this.lastActionFeedback = 'MANTÉN [A] PARA CORRER — SUELTA [A] PARA CAMBIAR DE CARRIL';
    }

    update(dt, now) {
        this.input.update(now);

        if (this.player.isAlive) {
            this.player.update(dt, now, this.input.isHoldingA);
            this.obstacleManager.update(dt, this.player);
            this.collisionSystem.update(this.player, this.obstacleManager.obstacles);
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

        this.uiDistance.textContent = `${distMeters} m`;
        this.uiBest.textContent = `${this.bestDistance} m`;
        this.uiLane.textContent = this.config.LANES.NAMES[this.player.lane];

        const ctrl = this.input.getControlState(now);
        if (ctrl.isHoldingA) {
            this.uiControlA.textContent = 'A: CORRIENDO';
            this.uiControlA.className = 'pill active-run';
        } else if (ctrl.laneSwitchReady) {
            this.uiControlA.textContent = 'A: CAMBIO LISTO (1 o 2 TOQUES)';
            this.uiControlA.className = 'pill switch-ready';
        } else {
            this.uiControlA.textContent = 'A: DETENIDO (MANTÉN A)';
            this.uiControlA.className = 'pill idle';
        }

        if (this.player.bActionTimer > 0) {
            this.uiControlB.textContent = `B: ${this.player.bLastOutcome}`;
            this.uiControlB.className = 'pill active-b';
        } else {
            this.uiControlB.textContent = 'B: ACCIÓN CONTEXTUAL';
            this.uiControlB.className = 'pill idle';
        }

        const pursuitPct = Math.max(0, Math.min(100, (this.player.pursuitDistance / this.config.PURSUIT.INITIAL_DISTANCE) * 100));
        this.uiPursuitBar.style.width = `${pursuitPct}%`;
        this.uiPursuitBar.style.backgroundColor = pursuitPct < 40 ? '#ff1e38' : '#e2e8f0';

        this.uiFeedback.textContent = this.lastActionFeedback;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.PSR.app = new GameApp();
});
