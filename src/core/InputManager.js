/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - InputManager (Resolución Directa 1 Toque vs 2 Toques)
 * -------------------------------------------------------------------------------------
 * Gestiona la filosofía de DOS CONTROLES (A y B):
 *
 * Lógica optimizada del Control A (Carriles 1, 2, 3):
 *  - Mantener A: Correr.
 *  - Soltar A: Habilita el cambio de carril desde tu carril actual.
 *  - 1 Toque rápido de A: Avanza directamente al carril siguiente (1→2, 2→3, 3→1).
 *  - 2 Toques rápidos de A: Regresa directamente al carril anterior (3→2, 2→1, 1→3)
 *    SIN pasar primero por el carril siguiente.
 *  - Volver a mantener A: Continúa corriendo en el nuevo carril.
 */
window.PSR = window.PSR || {};

class InputManager {
    constructor(eventBus, config) {
        this.eventBus = eventBus;
        this.config = config;

        // Estado físico de los controles
        this.isHoldingA = false;
        this.isHoldingB = false;

        // Tiempos para detección precisa de toques (Tap vs Hold) en Control A
        this.aPressTime = 0;
        this.aReleaseTime = 0;
        this.lastPressDurationMs = 0;
        this.lastTapTime = 0;
        this.lastTapIntervalMs = 0;
        this.tapCount = 0;

        // Estado de resolución entre 1 toque y 2 toques (evita saltar al siguiente antes de confirmar doble toque)
        this.pendingSingleTap = false;
        this.firstTapReleaseTime = 0;
        this.firstTapDurationMs = 0;

        // Estado de la máquina de cambio de carril
        this.hasRunAtLeastOnce = false;
        this.laneSwitchReady = false;
        this.switchOriginLane = this.config.LANES.DEFAULT_LANE;
        this.currentLogicalLane = this.config.LANES.DEFAULT_LANE;

        // Estado previo del mando (Gamepad)
        this.gamepadPrevA = false;
        this.gamepadPrevB = false;

        this._bindEvents();
    }

    reset(initialLane = this.config.LANES.DEFAULT_LANE) {
        this.currentLogicalLane = initialLane;
        this.switchOriginLane = initialLane;
        this.tapCount = 0;
        this.pendingSingleTap = false;
        this.firstTapReleaseTime = 0;
        this.firstTapDurationMs = 0;
        this.lastTapTime = 0;
        this.lastTapIntervalMs = 0;
        this.hasRunAtLeastOnce = this.isHoldingA;
        this.laneSwitchReady = false;
    }

    syncLane(laneIndex) {
        this.currentLogicalLane = laneIndex;
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;

            if (this._isControlAKey(e.code)) {
                e.preventDefault();
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    document.activeElement.blur();
                }
                this._onAPressed(performance.now());
            } else if (this._isControlBKey(e.code)) {
                e.preventDefault();
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    document.activeElement.blur();
                }
                this._onBPressed(performance.now());
            } else if (e.code === 'KeyR') {
                this.eventBus.emit('input:restart');
            } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
                this.eventBus.emit('sandbox:spawn_key', { slot: 1 });
            } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
                this.eventBus.emit('sandbox:spawn_key', { slot: 2 });
            } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
                this.eventBus.emit('sandbox:spawn_key', { slot: 3 });
            } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
                this.eventBus.emit('sandbox:spawn_key', { slot: 4 });
            } else if (e.code === 'Digit0' || e.code === 'Numpad0' || e.code === 'KeyC') {
                this.eventBus.emit('sandbox:clear_obstacles');
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this._isControlAKey(e.code)) {
                e.preventDefault();
                this._onAReleased(performance.now());
            } else if (this._isControlBKey(e.code)) {
                e.preventDefault();
                this._onBReleased(performance.now());
            }
        });

        window.addEventListener('blur', () => {
            if (this.isHoldingA) {
                this._onAReleased(performance.now());
            }
            if (this.isHoldingB) {
                this._onBReleased(performance.now());
            }
        });

        window.addEventListener('touchstart', (e) => {
            if (e.target && e.target.closest && e.target.closest('.sandbox-ui-interactive')) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.clientX < window.innerWidth * 0.5) {
                    this._onAPressed(performance.now());
                } else {
                    this._onBPressed(performance.now());
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (e.target && e.target.closest && e.target.closest('.sandbox-ui-interactive')) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.clientX < window.innerWidth * 0.5) {
                    this._onAReleased(performance.now());
                } else {
                    this._onBReleased(performance.now());
                }
            }
        }, { passive: true });
    }

    _isControlAKey(code) {
        return code === 'KeyA' || code === 'ArrowLeft';
    }

    _isControlBKey(code) {
        return code === 'KeyB' || code === 'KeyL' || code === 'KeyJ' || code === 'ArrowRight' || code === 'Space';
    }

    _onAPressed(now) {
        if (this.isHoldingA) return;
        this.isHoldingA = true;
        this.aPressTime = now;

        this.eventBus.emit('input:a_down', { timestamp: now });
    }

    /**
     * Ejecuta efectivamente el cambio de 1 Toque (Carril Siguiente: 1→2, 2→3, 3→1)
     */
    _commitSingleTap(now) {
        if (!this.pendingSingleTap) return;
        this.pendingSingleTap = false;

        const laneCount = this.config.LANES.COUNT;
        const origin = this.switchOriginLane;
        const nextLane = (origin + 1) % laneCount;

        this.currentLogicalLane = nextLane;
        this.switchOriginLane = nextLane;
        this.tapCount = 0;

        this.eventBus.emit('input:lane_change', {
            type: 'SINGLE_TAP_NEXT',
            targetLane: nextLane,
            originLane: origin,
            pressDurationMs: Math.round(this.firstTapDurationMs)
        });
    }

    /**
     * Ejecuta efectivamente el cambio de 2 Toques (Carril Anterior directo: 3→2, 2→1, 1→3)
     */
    _commitDoubleTap(now, secondTapDurationMs, tapIntervalMs) {
        this.pendingSingleTap = false;

        const laneCount = this.config.LANES.COUNT;
        const origin = this.switchOriginLane;
        const prevLane = (origin - 1 + laneCount) % laneCount;

        this.currentLogicalLane = prevLane;
        this.switchOriginLane = prevLane;
        this.tapCount = 0;
        this.lastTapIntervalMs = tapIntervalMs;

        this.eventBus.emit('input:lane_change', {
            type: 'DOUBLE_TAP_PREV',
            targetLane: prevLane,
            originLane: origin,
            pressDurationMs: Math.round(secondTapDurationMs),
            tapIntervalMs: Math.round(tapIntervalMs)
        });
    }

    _onAReleased(now) {
        if (!this.isHoldingA) return;
        this.isHoldingA = false;
        this.aReleaseTime = now;

        const pressDuration = now - this.aPressTime;
        this.lastPressDurationMs = pressDuration;

        const { TAP_MAX_DURATION_MS, DOUBLE_TAP_WINDOW_MS } = this.config.CONTROLS;

        if (this.laneSwitchReady && pressDuration <= TAP_MAX_DURATION_MS) {
            const timeSinceFirstTap = now - this.firstTapReleaseTime;

            if (this.pendingSingleTap && timeSinceFirstTap <= DOUBLE_TAP_WINDOW_MS) {
                // --- DOS TOQUES RÁPIDOS DE A: Va DIRECTO al carril anterior (ej. 3 → 2) ---
                this._commitDoubleTap(now, pressDuration, timeSinceFirstTap);
            } else {
                // Si había un primer toque viejo ya vencido, lo cerramos primero
                if (this.pendingSingleTap) {
                    this._commitSingleTap(now);
                }
                // --- PRIMER TOQUE DE A: Abre breve ventana para ver si viene un 2do toque ---
                this.pendingSingleTap = true;
                this.firstTapReleaseTime = now;
                this.firstTapDurationMs = pressDuration;
                this.lastTapTime = now;
                this.tapCount = 1;

                this.eventBus.emit('input:first_tap_pending', {
                    originLane: this.switchOriginLane,
                    pressDurationMs: Math.round(pressDuration)
                });
            }
        } else {
            // El jugador soltó A tras haberla mantenido para correr -> Desbloquea cambio de carril
            if (this.pendingSingleTap) {
                this._commitSingleTap(now);
            }
            this.laneSwitchReady = true;
            this.switchOriginLane = this.currentLogicalLane;
            this.tapCount = 0;

            this.eventBus.emit('input:lane_switch_unlocked', {
                originLane: this.switchOriginLane,
                timestamp: now,
                heldDurationMs: Math.round(pressDuration)
            });
        }

        this.eventBus.emit('input:a_up', {
            timestamp: now,
            pressDuration
        });
    }

    _onBPressed(now) {
        if (this.isHoldingB) return;
        this.isHoldingB = true;

        this.eventBus.emit('input:b_action', {
            timestamp: now,
            whileHoldingA: this.isHoldingA
        });
    }

    _onBReleased(now) {
        this.isHoldingB = false;
        this.eventBus.emit('input:b_up', { timestamp: now });
    }

    update(now) {
        this._pollGamepad(now);

        const { TAP_MAX_DURATION_MS, DOUBLE_TAP_WINDOW_MS } = this.config.CONTROLS;

        // 1. Si hay un 1er toque pendiente:
        if (this.pendingSingleTap) {
            if (!this.isHoldingA) {
                // Si no está presionando A y ya expiró la ventana de doble toque -> Confirmar 1 Toque (ej. 3 → 1)
                if (now - this.firstTapReleaseTime >= DOUBLE_TAP_WINDOW_MS) {
                    this._commitSingleTap(now);
                }
            } else {
                // Si volvió a presionar A y la MANTIENE presionada (> TAP_MAX_DURATION_MS) para correr ->
                // Confirmar 1 Toque (ej. 3 → 1) de inmediato y seguir corriendo
                const heldTime = now - this.aPressTime;
                if (heldTime > TAP_MAX_DURATION_MS) {
                    this._commitSingleTap(now);
                }
            }
        }

        // 2. Si mantiene A presionado más allá del umbral de toque, es carrera sostenida
        if (this.isHoldingA) {
            const heldTime = now - this.aPressTime;
            if (heldTime > TAP_MAX_DURATION_MS) {
                this.hasRunAtLeastOnce = true;
                this.switchOriginLane = this.currentLogicalLane;
                this.tapCount = 0;
            }
        }
    }

    _pollGamepad(now) {
        if (!navigator.getGamepads) return;
        const gamepads = navigator.getGamepads();
        const gp = gamepads && gamepads[0];
        if (!gp) return;

        const gpA = Boolean(gp.buttons[0] && gp.buttons[0].pressed);
        const gpB = Boolean(
            (gp.buttons[1] && gp.buttons[1].pressed) ||
            (gp.buttons[2] && gp.buttons[2].pressed)
        );

        if (gpA && !this.gamepadPrevA) this._onAPressed(now);
        if (!gpA && this.gamepadPrevA) this._onAReleased(now);

        if (gpB && !this.gamepadPrevB) this._onBPressed(now);
        if (!gpB && this.gamepadPrevB) this._onBReleased(now);

        this.gamepadPrevA = gpA;
        this.gamepadPrevB = gpB;
    }

    getControlState(now = performance.now()) {
        const heldDuration = this.isHoldingA ? (now - this.aPressTime) : 0;
        const isSustainedRun = this.isHoldingA && heldDuration > this.config.CONTROLS.TAP_MAX_DURATION_MS;
        const doubleTapRemainingMs = this.pendingSingleTap
            ? Math.max(0, this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS - (now - this.firstTapReleaseTime))
            : 0;

        return {
            isHoldingA: this.isHoldingA,
            isSustainedRun,
            heldDurationMs: heldDuration,
            lastPressDurationMs: this.lastPressDurationMs,
            pendingSingleTap: this.pendingSingleTap,
            doubleTapRemainingMs,
            lastTapIntervalMs: this.lastTapIntervalMs,
            isHoldingB: this.isHoldingB,
            laneSwitchReady: this.laneSwitchReady && !isSustainedRun,
            tapCount: this.tapCount,
            currentLane: this.currentLogicalLane,
            switchOriginLane: this.switchOriginLane
        };
    }
}

window.PSR.InputManager = InputManager;
