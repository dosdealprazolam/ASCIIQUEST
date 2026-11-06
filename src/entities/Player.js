/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Player (Corredor + Fisiología BPM Progresiva)
 * -------------------------------------------------------------------------------------
 *  - Ritmo Cardíaco (BPM) realista:
 *      1. Inicia en estado alerta moderado (`110 BPM`, fluctuando `109 ↔ 110`).
 *      2. A medida que corres, sube progresivamente (`110 → 120 → 130 → 140 → 150 → 160 → 170 → 180`).
 *      3. Una vez en el máximo (`179 ↔ 180`), si desaceleras un instante para cambiar de carril
 *         solo baja un escalón sutil (`169 ↔ 170`), y es muy difícil que caiga hasta el nivel
 *         de descanso a menos que el personaje se quede AFK / detenido sin correr.
 *      4. Al golpear con [B], el corazón aumenta un par de BPMs adicionales (+3 BPM).
 */
window.PSR = window.PSR || {};

class Player {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
        this.sandboxImmortal = false;
        this.reset();
    }

    reset() {
        const defaultLane = this.config.LANES.DEFAULT_LANE;

        this.lane = defaultLane;
        this.visualLane = defaultLane;
        this.previousLane = defaultLane;

        this.z = 0;
        this.speed = 0;
        this.speedMultiplier = 1.0;
        this.stridePhase = 0;

        this.lastSustainedRunTime = 0;
        this.hasStartedRunning = false;

        // Guardado exclusivamente para el obstáculo tentativo (TENTATIVE_HEAVY_TOWER)
        this.shoveSlowdownTimer = 0;

        // Fisiología del corazón (BPM progresivo + oscilación viva + subida al golpear)
        const initialBpm = (this.config.BPM && this.config.BPM.INITIAL_ALERT_BPM) || 110;
        this.bpm = initialBpm;
        this.baseBpmAnchor = initialBpm;
        this.cardiacExertion = 0.0;   // 0.0 = Alerta inicial (110 BPM) -> 1.0 = Esfuerzo máximo (180 BPM)
        this.afkIdleTimer = 0;        // Tiempo detenido sin correr ni golpear (AFK)
        this.smoothBandIndex = 0;
        this.bpmStrikeBoost = 0;
        this.bpmOscillationTimer = 0;
        this.heartPulsePhase = 0;

        this.bActionTimer = 0;
        this.bLastOutcome = 'NONE';

        this.pursuitDistance = this.config.PURSUIT.INITIAL_DISTANCE;

        this.isAlive = true;
        this.deathReason = '';
        this.deathDetail = '';
        this.deathDiagnostics = null;
    }

    setTargetLane(targetLane, switchType) {
        if (!this.isAlive) return;
        this.previousLane = this.lane;
        this.lane = targetLane;

        this.eventBus.emit('player:lane_changed', {
            fromLane: this.previousLane,
            toLane: this.lane,
            switchType
        });
    }

    /**
     * Se dispara cada vez que el jugador ejecuta un golpe/acción con [B].
     * Sube el corazón un par de BPMs y aporta al esfuerzo cardíaco.
     */
    triggerContextualAction(outcome = 'EMPTY') {
        if (!this.isAlive) return;
        this.bActionTimer = this.config.CONTROLS.B_ACTION_DURATION_MS / 1000;
        this.bLastOutcome = outcome;
        this.afkIdleTimer = 0;

        const bpmCfg = this.config.BPM || {};
        const boostPerStrike = bpmCfg.STRIKE_BPM_BOOST || 3;
        const maxBoost = bpmCfg.STRIKE_MAX_BOOST || 9;
        this.bpmStrikeBoost = Math.min(maxBoost, this.bpmStrikeBoost + boostPerStrike);
        this.cardiacExertion = Math.min(1.0, this.cardiacExertion + 0.035);
    }

    /**
     * Guardado exclusivamente para el futuro obstáculo tentativo (TENTATIVE_HEAVY_TOWER).
     */
    applyStructureShoveSlowdown() {
        if (!this.isAlive) return;
        const mov = this.config.MOVEMENT;
        const durationSec = (mov.SHOVE_SLOWDOWN_MS || 360) / 1000;
        const factor = mov.SHOVE_SPEED_FACTOR || 0.62;

        this.shoveSlowdownTimer = durationSec;
        const targetShoveSpeed = this.getEffectiveMaxSpeed() * factor;
        this.speed = Math.min(this.speed, targetShoveSpeed);
    }

    getGraceRemainingMs(now, isHoldingA) {
        if (isHoldingA || !this.hasStartedRunning) return this.config.MOVEMENT.MOMENTUM_GRACE_MS;
        const elapsed = now - this.lastSustainedRunTime;
        return Math.max(0, this.config.MOVEMENT.MOMENTUM_GRACE_MS - elapsed);
    }

    getEffectiveMaxSpeed() {
        return Math.round(this.config.MOVEMENT.MAX_RUN_SPEED * this.speedMultiplier);
    }

    update(dt, now, isHoldingA) {
        if (!this.isAlive) return;

        const mov = this.config.MOVEMENT;
        const pursuitCfg = this.config.PURSUIT;
        const effectiveMaxSpeed = this.getEffectiveMaxSpeed();

        if (this.shoveSlowdownTimer > 0) {
            this.shoveSlowdownTimer = Math.max(0, this.shoveSlowdownTimer - dt);
        }

        const currentSpeedCap = this.shoveSlowdownTimer > 0
            ? effectiveMaxSpeed * (mov.SHOVE_SPEED_FACTOR || 0.62)
            : effectiveMaxSpeed;

        // 1. Actualizar velocidad según el Control A
        if (isHoldingA) {
            this.hasStartedRunning = true;
            this.lastSustainedRunTime = now;
            if (this.speed < currentSpeedCap) {
                this.speed = Math.min(currentSpeedCap, this.speed + mov.ACCELERATION * this.speedMultiplier * dt);
            } else {
                this.speed = Math.max(currentSpeedCap, this.speed - mov.STOP_DECELERATION * 1.4 * dt);
            }
        } else if (this.hasStartedRunning) {
            const timeSinceRelease = now - this.lastSustainedRunTime;
            if (timeSinceRelease <= mov.MOMENTUM_GRACE_MS) {
                const minGraceSpeed = currentSpeedCap * 0.78;
                this.speed = Math.max(minGraceSpeed, this.speed - mov.GRACE_DECELERATION * dt);
            } else {
                this.speed = Math.max(0, this.speed - mov.STOP_DECELERATION * dt);
            }
        }

        // 2. Avanzar en el escenario
        this.z += this.speed * dt;

        // 3. Fase de zancada
        const speedRatio = effectiveMaxSpeed > 0 ? (this.speed / effectiveMaxSpeed) : 0;
        this.stridePhase += dt * (4.0 + speedRatio * 15.0);

        // 4. Actualizar monitor cardíaco (inicia en alerta ~110, sube progresivo a 180, no cae a descanso salvo AFK)
        this._updateHeartRateBpm(dt, speedRatio, isHoldingA);

        // 5. Interpolación rápida y precisa entre carriles
        const laneDiff = this.lane - this.visualLane;
        if (Math.abs(laneDiff) < 0.005) {
            this.visualLane = this.lane;
        } else {
            this.visualLane += laneDiff * Math.min(1, this.config.LANES.SWITCH_LERP_SPEED * dt);
        }

        // 6. Temporizador visual de la acción contextual B
        if (this.bActionTimer > 0) {
            this.bActionTimer = Math.max(0, this.bActionTimer - dt);
        }

        // 7. Presión de la persecución
        if (this.hasStartedRunning) {
            if (speedRatio > 0.72 || this.shoveSlowdownTimer > 0) {
                this.pursuitDistance = Math.min(
                    pursuitCfg.INITIAL_DISTANCE,
                    this.pursuitDistance + pursuitCfg.RECOVERY_RATE * dt
                );
            } else if (!this.sandboxImmortal) {
                const deficit = 1.0 - speedRatio;
                this.pursuitDistance -= pursuitCfg.APPROACH_RATE_WHEN_SLOW * deficit * dt;
                if (this.pursuitDistance <= 0) {
                    this.pursuitDistance = 0;
                    this.die(
                        'TE ALCANZÓ LA PESADILLA',
                        'Dejaste de mantener [A] demasiado tiempo y perdiste toda tu velocidad.',
                        {
                            verdict: 'DINÁMICA DE JUEGO (DETENCIÓN / AFK)',
                            isBugSuspect: false,
                            explanation: 'El corredor soltó [A] demasiado tiempo y el margen de persecución llegó a 0%.',
                            obstacleInfo: 'Ninguno (alcanzado por la persecución)',
                            bInteractionSummary: 'N/A'
                        },
                        '💡 CONSEJO: Nunca dejes suelta la tecla [A] por mucho tiempo. Tras dar 1 o 2 toques para cambiar de carril, vuelve a mantener [A] de inmediato.'
                    );
                }
            }
        }
    }

    /**
     * Fisiología del Monitor de BPM:
     *  - Inicia en estado alerta moderado (banda 0 = 110 BPM, fluctuando 109 ↔ 110).
     *  - Mientras el jugador corre, `cardiacExertion` sube progresivamente hasta 1.0 (banda máxima = 180 BPM).
     *  - Una vez que el corazón ya subió (ej. a 180 BPM):
     *      * Si suelta [A] un momento para cambiar de carril o desacelera un poquito, solo baja 1 escalón
     *        respecto a su esfuerzo actual (ej. de 180↔179 baja a 170↔169) para guiar visualmente la desaceleración.
     *      * NO cae hasta el nivel de descanso (110 BPM) a menos que el personaje se quede AFK (detenido sin correr).
     */
    _updateHeartRateBpm(dt, speedRatio, isHoldingA) {
        const bpmCfg = this.config.BPM || {};
        const bands = bpmCfg.BASE_BANDS || [110, 120, 130, 140, 150, 160, 170, 180];
        const maxBandIdx = bands.length - 1; // 7 -> 180 BPM
        const rampUpRate = bpmCfg.RAMP_UP_RATE || 0.16;
        const afkDelaySec = bpmCfg.AFK_DELAY_SEC || 1.6;
        const afkCooldownRate = bpmCfg.AFK_COOLDOWN_RATE || 0.11;
        const smoothRate = bpmCfg.SMOOTH_SPEED || 7.5;
        const strikeDecay = bpmCfg.STRIKE_DECAY_PER_SEC || 4.5;

        // 1. Decaimiento suave del pico extra por golpear con [B]
        if (this.bpmStrikeBoost > 0) {
            this.bpmStrikeBoost = Math.max(0, this.bpmStrikeBoost - strikeDecay * dt);
        }

        // 2. Actualizar esfuerzo cardíaco acumulado (sube progresivamente al correr; solo baja si está AFK)
        if (isHoldingA && speedRatio > 0.25) {
            this.afkIdleTimer = 0;
            this.cardiacExertion = Math.min(1.0, this.cardiacExertion + rampUpRate * (0.4 + 0.6 * speedRatio) * dt);
        } else if (this.speed > 40) {
            // Está en movimiento / cambiando de carril: no está AFK, el esfuerzo acumulado se mantiene alto
            this.afkIdleTimer = 0;
        } else {
            // El personaje está detenido / AFK
            this.afkIdleTimer += dt;
            if (this.afkIdleTimer >= afkDelaySec) {
                this.cardiacExertion = Math.max(0.0, this.cardiacExertion - afkCooldownRate * dt);
            }
        }

        // 3. Banda techo según el esfuerzo cardíaco alcanzado hasta ahora (0 -> 110 BPM ... 7 -> 180 BPM)
        const exertionBandIdx = this.cardiacExertion * maxBandIdx;

        // 4. Si desacelera un poquito al soltar [A], baja 1 escalón (o 2 si frena fuerte) respecto a su techo actual,
        //    pero sin caer hasta descanso a menos que esté AFK
        let decelPenaltyBands = 0;
        if (this.hasStartedRunning && (!isHoldingA || speedRatio < 0.96)) {
            if (speedRatio >= 0.68) {
                decelPenaltyBands = 1; // Ej: de 180 (179↔180) baja un poquito a 170 (169↔170)
            } else if (speedRatio >= 0.20) {
                decelPenaltyBands = 2; // Ej: de 180 baja a 160 (159↔160)
            } else {
                // Cuando ya se detuvo por completo, baja gradualmente según el enfriamiento AFK
                decelPenaltyBands = this.afkIdleTimer < afkDelaySec ? 2 : 0;
            }
        }

        const targetBandFloat = Math.max(0, exertionBandIdx - decelPenaltyBands);
        const diff = targetBandFloat - this.smoothBandIndex;
        if (Math.abs(diff) < 0.03) {
            this.smoothBandIndex = targetBandFloat;
        } else {
            this.smoothBandIndex += diff * Math.min(1, smoothRate * dt);
        }

        let activeBandIdx = Math.round(this.smoothBandIndex);
        // Si estaba en el techo máximo y acaba de soltar A / desacelerar, reflejar de inmediato el escalón inferior
        if (decelPenaltyBands > 0 && Math.round(exertionBandIdx) >= 1) {
            activeBandIdx = Math.min(Math.round(exertionBandIdx) - 1, activeBandIdx);
        }
        activeBandIdx = Math.max(0, Math.min(maxBandIdx, activeBandIdx));

        const anchor = bands[activeBandIdx]; // 110, 120, 130, 140, 150, 160, 170 o 180
        this.baseBpmAnchor = anchor;

        // 5. Oscilación viva de monitor entre el número terminado en 0 y su par terminado en 9 (ej. 180 ↔ 179, 110 ↔ 109)
        this.bpmOscillationTimer += dt * 4.2;
        const oscWave = Math.sin(this.bpmOscillationTimer) + 0.35 * Math.cos(this.bpmOscillationTimer * 2.3);
        const oscOffset = oscWave < -0.15 ? -1 : 0;

        // 6. Sumar el aumento de BPM cuando golpea con [B]
        const boostInt = Math.round(this.bpmStrikeBoost);
        this.bpm = anchor + oscOffset + boostInt;

        this.heartPulsePhase += dt * (this.bpm / 60) * Math.PI * 2;
    }

    die(reason, detail, diagnostics = null, advice = '') {
        this.deathDiagnostics = diagnostics;
        this.deathAdvice = advice;
        if (this.sandboxImmortal) {
            this.eventBus.emit('sandbox:collision_impact', {
                reason,
                detail,
                advice,
                diagnostics,
                distance: Math.floor(this.z / 10)
            });
            return;
        }
        if (!this.isAlive) return;
        this.isAlive = false;
        this.speed = 0;
        this.deathReason = reason;
        this.deathDetail = detail;

        this.eventBus.emit('player:died', {
            reason,
            detail,
            advice,
            diagnostics,
            distance: Math.floor(this.z / 10)
        });
    }
}

window.PSR.Player = Player;
