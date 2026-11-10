/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - InputManager (Gatillos Ultra Sensibles + 0ms)
 * -----------------------------------------------------------------------------
 * Incluye tecnología "Rapid-Trigger" (Gatillo Sensible) para mando y teclado/ratón:
 *  - Los gatillos analógicos (LT/RT, L2/R2) se activan con apenas 12% de recorrido.
 *  - Basta levantar el dedo un 6% desde el punto máximo para rearmar el gatillo
 *    y permitir "button mashing" frenético sin tener que soltar el gatillo hasta cero.
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

        // Métricas de mashing de B
        this.bPressTimestamps = [];
        this.totalBMashes = 0;

        // Estado de la máquina de cambio de carril
        this.hasRunAtLeastOnce = false;
        this.laneSwitchReady = false;
        this.switchOriginLane = this.config.LANES.DEFAULT_LANE;
        this.currentLogicalLane = this.config.LANES.DEFAULT_LANE;

        // Estado Rapid-Trigger para gatillos analógicos de mando
        this.gamepadPrevA = false;
        this.gamepadPrevB = false;
        this.peakTriggerA = 0;
        this.troughTriggerA = 0;
        this.peakTriggerB = 0;
        this.troughTriggerB = 0;

        this._bindEvents();
    }

    reset(initialLane = this.config.LANES.DEFAULT_LANE) {
        this.currentLogicalLane = initialLane;
        this.switchOriginLane = initialLane;
        this.tapCount = 0;
        this.lastTapTime = 0;
        this.lastTapIntervalMs = 0;
        this.bPressTimestamps = [];
        this.totalBMashes = 0;
        this.hasRunAtLeastOnce = this.isHoldingA;
        this.laneSwitchReady = false;
    }

    _forceSilentReleaseAll() {
        this.isHoldingA = false;
        this.isHoldingB = false;
        this.gamepadPrevA = false;
        this.gamepadPrevB = false;
        this.laneSwitchReady = false;
        this.tapCount = 0;
    }

    syncLane(laneIndex) {
        this.currentLogicalLane = laneIndex;
    }

    _isTypingText() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'INPUT') {
            const type = (el.type || 'text').toLowerCase();
            return type === 'text' || type === 'search';
        }
        return false;
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (this._isTypingText()) {
                if (e.code === 'Escape') {
                    document.activeElement.blur();
                }
                return;
            }
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
            if (this._isTypingText()) return;
            if (this._isControlAKey(e.code)) {
                e.preventDefault();
                this._onAReleased(performance.now());
            } else if (this._isControlBKey(e.code)) {
                e.preventDefault();
                this._onBReleased(performance.now());
            }
        });

        // Soporte de clic de ratón sobre el lienzo para mashear B a máxima velocidad
        window.addEventListener('mousedown', (e) => {
            if (e.target && e.target.id === 'game-canvas') {
                this._onBPressed(performance.now());
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isHoldingB) {
                this._onBReleased(performance.now());
            }
        });

        window.addEventListener('blur', () => {
            this._forceSilentReleaseAll();
        });

        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this._forceSilentReleaseAll();
                }
            });
        }

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
        return (
            code === 'KeyB' ||
            code === 'KeyL' ||
            code === 'KeyJ' ||
            code === 'KeyK' ||
            code === 'ArrowRight' ||
            code === 'Space'
        );
    }

    _onAPressed(now) {
        if (this.isHoldingA) return;
        this.isHoldingA = true;
        this.aPressTime = now;

        this.eventBus.emit('input:a_down', { timestamp: now });
    }

    _onAReleased(now) {
        if (!this.isHoldingA) return;
        this.isHoldingA = false;
        this.aReleaseTime = now;

        const pressDuration = now - this.aPressTime;
        this.lastPressDurationMs = pressDuration;

        const { TAP_MAX_DURATION_MS } = this.config.CONTROLS;
        const laneCount = this.config.LANES.COUNT;

        // Respuesta instantánea en 0ms al soltar el toque: avanza al siguiente carril sin requerir doble pulsación
        if (this.laneSwitchReady && pressDuration <= TAP_MAX_DURATION_MS) {
            this.tapCount = 1;
            this.lastTapIntervalMs = 0;
            this.lastTapTime = now;
            const nextLane = (this.currentLogicalLane + 1) % laneCount;
            const originLane = this.currentLogicalLane;
            this.currentLogicalLane = nextLane;
            this.switchOriginLane = nextLane;

            this.eventBus.emit('input:lane_change', {
                type: 'SINGLE_TAP_NEXT',
                targetLane: nextLane,
                originLane,
                pressDurationMs: Math.round(pressDuration)
            });
        } else {
            // El jugador soltó A tras mantenerlo para correr -> Desbloquea cambio de carril con 1 toque
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
        // Permitir re-disparo ultra rápido para mashing continuo
        this.isHoldingB = true;
        this.totalBMashes++;
        this.bPressTimestamps.push(now);

        this.eventBus.emit('input:b_action', {
            timestamp: now,
            whileHoldingA: this.isHoldingA,
            mashRate: this.getBMashRate(now)
        });
    }

    _onBReleased(now) {
        this.isHoldingB = false;
        this.eventBus.emit('input:b_up', { timestamp: now });
    }

    getBMashRate(now = performance.now()) {
        // Limpiar pulsaciones de hace más de 1 segundo
        while (this.bPressTimestamps.length > 0 && now - this.bPressTimestamps[0] > 1000) {
            this.bPressTimestamps.shift();
        }
        return this.bPressTimestamps.length;
    }

    update(now) {
        this._pollGamepadRapidTriggers(now);

        if (this.isHoldingA) {
            const heldTime = now - this.aPressTime;
            if (heldTime > this.config.CONTROLS.TAP_MAX_DURATION_MS) {
                this.hasRunAtLeastOnce = true;
                this.switchOriginLane = this.currentLogicalLane;
                this.tapCount = 0;
            }
        }
    }

    /**
     * Lectura de Mando con algoritmo Rapid-Trigger (Gatillos Ultra Sensibles):
     * Permite mashear LT/RT (L2/R2), LB/RB o botones frontales con recorrido mínimo.
     */
    _pollGamepadRapidTriggers(now) {
        if (typeof document !== 'undefined' && document.hidden) {
            return;
        }
        if (!navigator.getGamepads) return;
        const gamepads = navigator.getGamepads();
        const gp = gamepads && gamepads[0];
        if (!gp) return;

        const threshold = this.config.CONTROLS.TRIGGER_THRESHOLD || 0.08;
        const rapidDelta = this.config.CONTROLS.TRIGGER_RAPID_DELTA || 0.035;

        // Valor analógico máximo entre Botón A (0), LB (4) y Gatillo Izquierdo LT/L2 (6)
        const valA = Math.max(
            gp.buttons[0] ? gp.buttons[0].value : 0,
            gp.buttons[4] ? gp.buttons[4].value : 0,
            gp.buttons[6] ? gp.buttons[6].value : 0
        );

        // Valor analógico máximo entre Botones B/X (1, 2), RB (5) y Gatillo Derecho RT/R2 (7)
        const valB = Math.max(
            gp.buttons[1] ? gp.buttons[1].value : 0,
            gp.buttons[2] ? gp.buttons[2].value : 0,
            gp.buttons[5] ? gp.buttons[5].value : 0,
            gp.buttons[7] ? gp.buttons[7].value : 0
        );

        // Evaluación Rapid-Trigger para A
        let gpA = this.gamepadPrevA;
        if (!gpA) {
            this.troughTriggerA = Math.min(this.troughTriggerA, valA);
            if (valA >= threshold && (valA - this.troughTriggerA) >= rapidDelta) {
                gpA = true;
                this.peakTriggerA = valA;
            }
        } else {
            this.peakTriggerA = Math.max(this.peakTriggerA, valA);
            if (valA < threshold || (this.peakTriggerA - valA) >= rapidDelta) {
                gpA = false;
                this.troughTriggerA = valA;
            }
        }

        // Evaluación Rapid-Trigger para B (ideal para mashear RT/R2 o B a toda velocidad)
        let gpB = this.gamepadPrevB;
        if (!gpB) {
            this.troughTriggerB = Math.min(this.troughTriggerB, valB);
            if (valB >= threshold && (valB - this.troughTriggerB) >= rapidDelta) {
                gpB = true;
                this.peakTriggerB = valB;
            }
        } else {
            this.peakTriggerB = Math.max(this.peakTriggerB, valB);
            if (valB < threshold || (this.peakTriggerB - valB) >= rapidDelta) {
                gpB = false;
                this.troughTriggerB = valB;
            }
        }

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
        const doubleTapRemainingMs = (this.tapCount === 1)
            ? Math.max(0, this.config.CONTROLS.DOUBLE_TAP_WINDOW_MS - (now - this.lastTapTime))
            : 0;

        return {
            isHoldingA: this.isHoldingA,
            isSustainedRun,
            heldDurationMs: heldDuration,
            lastPressDurationMs: this.lastPressDurationMs,
            doubleTapRemainingMs,
            lastTapIntervalMs: this.lastTapIntervalMs,
            isHoldingB: this.isHoldingB,
            bMashRate: this.getBMashRate(now),
            laneSwitchReady: this.laneSwitchReady && !isSustainedRun,
            tapCount: this.tapCount,
            currentLane: this.currentLogicalLane,
            switchOriginLane: this.switchOriginLane
        };
    }
}

window.PSR.InputManager = InputManager;
