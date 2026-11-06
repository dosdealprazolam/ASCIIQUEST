/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Nivel Sandbox y Calibración (sandbox_main.js)
 * -----------------------------------------------------------------------------
 * Conecta el Sandbox con el selector de los 5 Niveles de Intensidad,
 * el medidor de masheo de B, y el MusicManager.
 */
window.PSR = window.PSR || {};

class SandboxApp {
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

        this.player.sandboxImmortal = true;
        this.obstacleManager.autoSpawnEnabled = false;
        this.obstacleManager.reset();

        this.inputHistory = [];
        this.impactCount = 0;

        this._cacheElements();
        this._initCalibrationSliders();
        this._bindEvents();
        this._pushLog('SANDBOX LISTO — Ajustes de tu captura cargados por defecto.');

        this.loop = new window.PSR.GameLoop(
            (dt, now) => this.update(dt, now),
            (dt, now) => this.render(dt, now)
        );
        this.loop.start();
    }

    _cacheElements() {
        this.elHoldBar = document.getElementById('bar-hold-a');
        this.elHoldText = document.getElementById('val-hold-a');
        this.elHoldThresholdMarker = document.getElementById('marker-tap-threshold');

        this.elDoubleTapBar = document.getElementById('bar-double-tap');
        this.elDoubleTapText = document.getElementById('val-double-tap');

        this.elGraceBar = document.getElementById('bar-grace');
        this.elGraceText = document.getElementById('val-grace');

        this.elSpeedBar = document.getElementById('bar-speed');
        this.elSpeedText = document.getElementById('val-speed');
        this.elBpmText = document.getElementById('val-bpm');

        this.laneBoxes = [
            document.getElementById('lane-box-0'),
            document.getElementById('lane-box-1'),
            document.getElementById('lane-box-2')
        ];
        this.elOriginLane = document.getElementById('val-origin-lane');
        this.elNextLaneHint = document.getElementById('val-next-lane');
        this.elPrevLaneHint = document.getElementById('val-prev-lane');

        this.elStateA = document.getElementById('sandbox-state-a');
        this.elStateB = document.getElementById('sandbox-state-b');
        this.elImpactCounter = document.getElementById('sandbox-impacts');

        this.elLogList = document.getElementById('sandbox-input-log');

        this.chkAutoSpawn = document.getElementById('chk-autospawn');
        this.chkMortal = document.getElementById('chk-mortal');
        this.selLevel = document.getElementById('sandbox-level-select');
    }

    _initCalibrationSliders() {
        this.sliderDefs = [
            {
                id: 'slider-tap-max',
                valId: 'lbl-tap-max',
                unit: ' ms',
                get: () => this.config.CONTROLS.TAP_MAX_DURATION_MS,
                set: (v) => { this.config.CONTROLS.TAP_MAX_DURATION_MS = v; }
            },
            {
                id: 'slider-double-tap',
                valId: 'lbl-double-tap',
                unit: ' ms',
                get: () => this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS,
                set: (v) => { this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS = v; }
            },
            {
                id: 'slider-grace',
                valId: 'lbl-grace',
                unit: ' ms',
                get: () => this.config.MOVEMENT.MOMENTUM_GRACE_MS,
                set: (v) => { this.config.MOVEMENT.MOMENTUM_GRACE_MS = v; }
            },
            {
                id: 'slider-lane-lerp',
                valId: 'lbl-lane-lerp',
                unit: '',
                get: () => this.config.LANES.SWITCH_LERP_SPEED,
                set: (v) => { this.config.LANES.SWITCH_LERP_SPEED = v; }
            },
            {
                id: 'slider-max-speed',
                valId: 'lbl-max-speed',
                unit: ' u/s',
                get: () => this.config.MOVEMENT.MAX_RUN_SPEED,
                set: (v) => { this.config.MOVEMENT.MAX_RUN_SPEED = v; }
            },
            {
                id: 'slider-accel',
                valId: 'lbl-accel',
                unit: ' u/s²',
                get: () => this.config.MOVEMENT.ACCELERATION,
                set: (v) => { this.config.MOVEMENT.ACCELERATION = v; }
            },
            {
                id: 'slider-stop-decel',
                valId: 'lbl-stop-decel',
                unit: ' u/s²',
                get: () => this.config.MOVEMENT.STOP_DECELERATION,
                set: (v) => { this.config.MOVEMENT.STOP_DECELERATION = v; }
            },
            {
                id: 'slider-b-range',
                valId: 'lbl-b-range',
                unit: ' u',
                get: () => this.config.CONTROLS.B_INTERACTION_RANGE,
                set: (v) => { this.config.CONTROLS.B_INTERACTION_RANGE = v; }
            }
        ];

        this._syncSlidersFromConfig();

        for (const def of this.sliderDefs) {
            const inputEl = document.getElementById(def.id);
            const lblEl = document.getElementById(def.valId);
            if (!inputEl || !lblEl) continue;

            inputEl.addEventListener('input', () => {
                const val = parseFloat(inputEl.value);
                def.set(val);
                lblEl.textContent = `${val}${def.unit}`;
                this.config.saveCalibration();
            });
        }

        const btnReset = document.getElementById('btn-reset-defaults');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.config.resetToDefaults();
                this._syncSlidersFromConfig();
                this._pushLog('⚙️ Valores calibrados por defecto restaurados.');
            });
        }

        const btnCopy = document.getElementById('btn-copy-config');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                const summary = JSON.stringify({
                    TAP_MAX_DURATION_MS: this.config.CONTROLS.TAP_MAX_DURATION_MS,
                    DOUBLE_TAP_WINDOW_MS: this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS,
                    MOMENTUM_GRACE_MS: this.config.MOVEMENT.MOMENTUM_GRACE_MS,
                    SWITCH_LERP_SPEED: this.config.LANES.SWITCH_LERP_SPEED,
                    MAX_RUN_SPEED: this.config.MOVEMENT.MAX_RUN_SPEED,
                    ACCELERATION: this.config.MOVEMENT.ACCELERATION,
                    STOP_DECELERATION: this.config.MOVEMENT.STOP_DECELERATION,
                    B_INTERACTION_RANGE: this.config.CONTROLS.B_INTERACTION_RANGE
                }, null, 2);

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(summary);
                }
                this._pushLog('📋 Configuración copiada al portapapeles.');
            });
        }
    }

    _syncSlidersFromConfig() {
        for (const def of this.sliderDefs) {
            const inputEl = document.getElementById(def.id);
            const lblEl = document.getElementById(def.valId);
            if (!inputEl || !lblEl) continue;
            const currentVal = def.get();
            inputEl.value = currentVal;
            lblEl.textContent = `${currentVal}${def.unit}`;
        }
    }

    _bindEvents() {
        const laneNames = this.config.LANES.NAMES;

        this.eventBus.on('input:lane_switch_unlocked', ({ originLane, heldDurationMs }) => {
            this._pushLog(`🔓 [A] Soltada tras ${heldDurationMs} ms → Cambio listo desde ${laneNames[originLane]}`);
        });

        this.eventBus.on('input:lane_change', ({ type, targetLane, originLane, pressDurationMs, tapIntervalMs }) => {
            if (!this.player.isAlive) return;
            this.player.setTargetLane(targetLane, type);
            this.input.syncLane(targetLane);

            const fromName = laneNames[originLane];
            const toName = laneNames[targetLane];

            if (type === 'SINGLE_TAP_NEXT') {
                this._pushLog(`⚡ 1 TOQUE [A] (${pressDurationMs} ms): ${fromName} → ${toName}`);
            } else {
                this._pushLog(`⚡⚡ 2 TOQUES [A] (intervalo ${tapIntervalMs} ms): ${fromName} → ${toName}`);
            }
        });

        this.eventBus.on('input:b_action', () => {
            if (!this.player.isAlive) {
                this.resetSandboxRun();
                return;
            }
            this.interactionSystem.executeContextualAction(this.player, this.obstacleManager.obstacles);
        });

        this.eventBus.on('interaction:mash_hit', ({ remainingHits, requiredHits }) => {
            this._pushLog(`🔨 [B] Impacto de masheo (quedan ${remainingHits}/${requiredHits} golpes)`);
        });

        this.eventBus.on('interaction:manipulated', ({ toLane }) => {
            this._pushLog(`💥 [B] ¡Estructura derrumbada hacia ${laneNames[toLane]}!`);
        });

        this.eventBus.on('interaction:shattered', () => {
            this._pushLog('💥 [B] ¡Barricada destrozada al paso!');
        });

        this.eventBus.on('player:barricade_trauma', ({ previousBpm, newBpm, recoverySeconds }) => {
            this._pushLog(`💔 1er Choque Barricada: BPM a la mitad (${previousBpm} → ${newBpm} BPM, recupera en ${recoverySeconds}s)`);
        });

        this.eventBus.on('interaction:resisted', () => {
            this._pushLog('🛡️ [B] Monolito indestructible: resistió el empuje');
        });

        this.eventBus.on('difficulty:level_up', ({ config }) => {
            this._pushLog(`🔥 ¡SUBIÓ A ${config.name}!`);
        });

        this.eventBus.on('sandbox:collision_impact', ({ reason, diagnostics }) => {
            this.impactCount++;
            const diagStr = diagnostics ? ` [${diagnostics.verdict}] ${diagnostics.explanation}` : '';
            this._pushLog(`❌ ${reason}:${diagStr}`);
        });

        this.eventBus.on('player:died', ({ reason, diagnostics }) => {
            this.impactCount++;
            const diagStr = diagnostics ? ` [${diagnostics.verdict}] ${diagnostics.explanation}` : '';
            this._pushLog(`💀 MUERTE: ${reason}:${diagStr}`);
        });

        this.eventBus.on('input:restart', () => {
            this.resetSandboxRun();
        });

        this.eventBus.on('sandbox:spawn_key', ({ slot }) => {
            this.spawnBySlot(slot);
        });

        this.eventBus.on('sandbox:clear_obstacles', () => {
            this.obstacleManager.clearAll(this.player.z);
            this._pushLog('🧹 Pista despejada (0 obstáculos).');
        });

        document.querySelectorAll('[data-spawn-slot]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const slot = parseInt(btn.getAttribute('data-spawn-slot'), 10);
                this.spawnBySlot(slot);
                btn.blur();
            });
        });

        const btnClear = document.getElementById('btn-clear-track');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.obstacleManager.clearAll(this.player.z);
                this._pushLog('🧹 Pista despejada (0 obstáculos).');
                btnClear.blur();
            });
        }

        if (this.selLevel) {
            this.selLevel.addEventListener('change', () => {
                const val = this.selLevel.value;
                if (val === 'auto') {
                    this.obstacleManager.forcedLevel = null;
                    this._pushLog('📈 Dificultad en modo Automático (+1 nivel cada 1000m).');
                } else {
                    const lvl = parseInt(val, 10);
                    this.obstacleManager.forcedLevel = lvl;
                    this.obstacleManager.currentLevel = lvl;
                    const cfg = this.obstacleManager.getLevelConfig(lvl);
                    this._pushLog(`🎯 Nivel fijado en: ${cfg.name}`);
                }
                this.selLevel.blur();
            });
        }

        if (this.chkAutoSpawn) {
            this.chkAutoSpawn.addEventListener('change', () => {
                this.obstacleManager.autoSpawnEnabled = this.chkAutoSpawn.checked;
                if (this.chkAutoSpawn.checked) {
                    this.obstacleManager.nextSpawnZ = this.player.z + 520;
                    this._pushLog('🔄 Oleadas automáticas ACTIVADAS.');
                } else {
                    this._pushLog('⏸️ Oleadas automáticas DESACTIVADAS (Pista limpia).');
                }
                this.chkAutoSpawn.blur();
            });
        }

        if (this.chkMortal) {
            this.chkMortal.addEventListener('change', () => {
                this.player.sandboxImmortal = !this.chkMortal.checked;
                if (!this.player.isAlive && this.player.sandboxImmortal) {
                    this.resetSandboxRun();
                }
                this._pushLog(
                    this.player.sandboxImmortal
                        ? '🛡️ Modo Inmortal ACTIVADO.'
                        : '💀 Muerte Real ACTIVADA.'
                );
                this.chkMortal.blur();
            });
        }
    }

    spawnBySlot(slot) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const lane = this.player.lane;
        const laneName = this.config.LANES.NAMES[lane];
        const lvlCfg = this.obstacleManager.getLevelConfig(this.obstacleManager.currentLevel);
        const hits = this.obstacleManager._rollHits(lvlCfg);

        if (slot === 1) {
            const obs = this.obstacleManager.spawnManual(TYPES.COLLAPSING_STRUCTURE, lane, this.player.z, 680, hits);
            const targetName = this.config.LANES.NAMES[obs.fallTargetLane];
            this._pushLog(`➕ [1] Estructura Inestable (${hits} golpes B) en ${laneName} → cae a ${targetName}`);
        } else if (slot === 2) {
            this.obstacleManager.spawnManual(TYPES.FRAGILE_BARRICADE, lane, this.player.z, 680, hits);
            this._pushLog(`➕ [2] Barricada Rompible (${hits} golpes B) en ${laneName}`);
        } else if (slot === 3) {
            this.obstacleManager.spawnManual(TYPES.SOLID_MONOLITH, lane, this.player.z, 680, 1);
            this._pushLog(`➕ [3] Monolito Sólido en ${laneName} (esquivar con [A])`);
        } else if (slot === 4) {
            this.obstacleManager.spawnDoubleFormation(lane, this.player.z, 720);
            this._pushLog('➕ [4] Formación Doble generada al frente');
        }
    }

    resetSandboxRun() {
        const keepImmortal = this.player.sandboxImmortal;
        this.player.reset();
        this.player.sandboxImmortal = keepImmortal;
        this.input.reset(this.player.lane);
        this.obstacleManager.clearAll(0);
        this._pushLog('🔄 Posición reiniciada.');
    }

    _pushLog(text) {
        const timeStr = new Date().toLocaleTimeString('es-ES', { hour12: false });
        this.inputHistory.unshift(`[${timeStr}] ${text}`);
        if (this.inputHistory.length > 6) {
            this.inputHistory.pop();
        }
        if (this.elLogList) {
            this.elLogList.innerHTML = this.inputHistory
                .map((item, idx) => `<div class="log-entry ${idx === 0 ? 'latest' : ''}">${item}</div>`)
                .join('');
        }
    }

    update(dt, now) {
        this.input.update(now);

        if (this.player.isAlive) {
            this.player.update(dt, now, this.input.isHoldingA);
            this.obstacleManager.update(dt, this.player);
            this.interactionSystem.update(dt, this.player, this.obstacleManager.obstacles);
            this.collisionSystem.update(this.player, this.obstacleManager.obstacles, this.interactionSystem);
        }

        if (this.musicManager) {
            this.musicManager.update(this.player, this.obstacleManager.currentLevel);
        }

        this._updateTelemetryUI(now);
    }

    render(dt, now) {
        this.renderer.render(dt, now, {
            player: this.player,
            obstacles: this.obstacleManager.obstacles,
            inputState: this.input.getControlState(now)
        });
    }

    _updateTelemetryUI(now) {
        const ctrl = this.input.getControlState(now);
        const tapMax = this.config.CONTROLS.TAP_MAX_DURATION_MS;
        const dblMax = this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS;
        const graceMax = this.config.MOVEMENT.MOMENTUM_GRACE_MS;

        const scaleMaxMs = 500;
        const displayHoldMs = ctrl.isHoldingA ? ctrl.heldDurationMs : ctrl.lastPressDurationMs;
        const holdPct = Math.min(100, (displayHoldMs / scaleMaxMs) * 100);
        const thresholdPct = Math.min(100, (tapMax / scaleMaxMs) * 100);

        this.elHoldThresholdMarker.style.left = `${thresholdPct}%`;
        this.elHoldBar.style.width = `${holdPct}%`;

        if (ctrl.isHoldingA) {
            if (ctrl.heldDurationMs <= tapMax) {
                this.elHoldBar.style.backgroundColor = '#ff9f1c';
                this.elHoldText.textContent = `${Math.round(ctrl.heldDurationMs)} ms (ZONA DE TOQUE <= ${tapMax}ms)`;
            } else {
                this.elHoldBar.style.backgroundColor = '#2ec4b6';
                this.elHoldText.textContent = `${Math.round(ctrl.heldDurationMs)} ms (CARRERA SOSTENIDA)`;
            }
        } else {
            const wasTap = ctrl.lastPressDurationMs > 0 && ctrl.lastPressDurationMs <= tapMax;
            this.elHoldBar.style.backgroundColor = wasTap ? '#ff9f1c' : '#64748b';
            this.elHoldText.textContent = ctrl.lastPressDurationMs > 0
                ? `Última pulsación: ${Math.round(ctrl.lastPressDurationMs)} ms (${wasTap ? 'TOQUE' : 'CARRERA'})`
                : '0 ms (Suelta)';
        }

        const dblPct = dblMax > 0 ? Math.min(100, (ctrl.doubleTapRemainingMs / dblMax) * 100) : 0;
        this.elDoubleTapBar.style.width = `${dblPct}%`;
        this.elDoubleTapText.textContent = ctrl.doubleTapRemainingMs > 0
            ? `¡ACTIVA! ${Math.round(ctrl.doubleTapRemainingMs)} ms para 2do toque`
            : (ctrl.lastTapIntervalMs > 0 ? `Último doble toque: ${Math.round(ctrl.lastTapIntervalMs)} ms` : 'Inactiva (da 1 toque tras soltar A)');

        const graceRem = this.player.getGraceRemainingMs(now, ctrl.isHoldingA);
        const gracePct = graceMax > 0 ? Math.min(100, (graceRem / graceMax) * 100) : 0;
        this.elGraceBar.style.width = `${gracePct}%`;
        this.elGraceText.textContent = `${Math.round(graceRem)} / ${graceMax} ms`;

        const maxSpd = this.player.getEffectiveMaxSpeed();
        const spdPct = maxSpd > 0 ? Math.min(100, (this.player.speed / maxSpd) * 100) : 0;
        this.elSpeedBar.style.width = `${spdPct}%`;
        this.elSpeedText.textContent = `${Math.round(this.player.speed)} / ${maxSpd} u/s (Nv.${this.obstacleManager.currentLevel})`;

        if (this.elBpmText) {
            const bpm = this.player.bpm || 150;
            const anchor = this.player.baseBpmAnchor || 150;
            const strikeBoost = Math.round(this.player.bpmStrikeBoost || 0);
            const stateTag = !this.player.hasStartedRunning
                ? '149↔150 REPOSO'
                : (strikeBoost > 0
                    ? `GOLPE +${strikeBoost} BPM`
                    : `${anchor - 1}↔${anchor}`);
            this.elBpmText.textContent = `♥ ${bpm} BPM (${stateTag})`;
            this.elBpmText.style.color = anchor >= 180 || strikeBoost > 0
                ? '#ff2a4b'
                : (bpm % 10 === 9 ? '#ff9f1c' : '#38bdf8');
        }

        const laneNames = this.config.LANES.NAMES;
        for (let i = 0; i < 3; i++) {
            const box = this.laneBoxes[i];
            if (!box) continue;
            box.classList.toggle('active-lane', this.player.lane === i);
            box.classList.toggle('origin-lane', ctrl.switchOriginLane === i && ctrl.laneSwitchReady);
        }

        const origin = ctrl.switchOriginLane;
        const nextLane = (origin + 1) % 3;
        const prevLane = (origin + 2) % 3;
        this.elOriginLane.textContent = laneNames[origin];
        this.elNextLaneHint.textContent = laneNames[nextLane];
        this.elPrevLaneHint.textContent = laneNames[prevLane];

        if (ctrl.isHoldingA) {
            this.elStateA.textContent = ctrl.isSustainedRun ? 'A: CORRIENDO' : 'A: PULSANDO (< TOQUE)';
            this.elStateA.className = 'pill active-run';
        } else if (ctrl.laneSwitchReady) {
            this.elStateA.textContent = 'A: SUELTA — LISTA';
            this.elStateA.className = 'pill switch-ready';
        } else {
            this.elStateA.textContent = 'A: REPOSO';
            this.elStateA.className = 'pill idle';
        }

        if (this.player.bActionTimer > 0 || ctrl.bMashRate > 0) {
            this.elStateB.textContent = `B: ${this.player.bLastOutcome} (${ctrl.bMashRate}/s)`;
            this.elStateB.className = 'pill active-b';
        } else {
            this.elStateB.textContent = 'B: LISTO (0/s)';
            this.elStateB.className = 'pill idle';
        }

        this.elImpactCounter.textContent = `${this.impactCount}`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.PSR.sandboxApp = new SandboxApp();
});
