/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Player (Corredor + Sistema BPM como Salud/Trauma)
 * -----------------------------------------------------------------------------------------
 *  - Fisiología normal de BPM:
 *      * Inicia en estado alerta moderado (`110 BPM`, fluctuando `109 ↔ 110`).
 *      * Sube progresivamente al correr (`110 → 120 → ... → 180 BPM`).
 *      * Al golpear con [B], sube un par de BPMs adicionales (+3 BPM).
 *      * Solo cae a descanso si el jugador se queda AFK.
 *  - Nuevo Uso del BPM en Obstáculos Básicos (`FRAGILE_BARRICADE` ╬):
 *      * 1er impacto contra barricada: NO te mata; baja tu BPM a la mitad (50%, ej. 180 → 90 BPM)
 *        y entra en un lapso de recuperación lenta de 12.5 segundos (10-15s) donde el BPM va
 *        subiendo poco a poco hasta recuperarse.
 *      * 2do impacto dentro de ese lapso (antes de terminar de recuperarse): te resta -70 BPM
 *        de golpe, vaciando tu pulso vital y causándote la muerte por Colapso Cardíaco.
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

        // Fisiología del corazón (BPM progresivo + Trauma por impacto con barricadas)
        const initialBpm = (this.config.BPM && this.config.BPM.INITIAL_ALERT_BPM) || 110;
        const bands = (this.config.BPM && this.config.BPM.BASE_BANDS) || [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
        const initialBandIdx = Math.max(0, bands.indexOf(initialBpm));

        this.bpm = initialBpm;
        this.baseBpmAnchor = initialBpm;
        this.cardiacExertion = 0.0;   // 0.0 = Alerta inicial (110 BPM) -> 1.0 = Esfuerzo máximo (180 BPM)
        this.afkIdleTimer = 0;
        this.smoothBandIndex = initialBandIdx;
        this.bpmStrikeBoost = 0;
        this.bpmOscillationTimer = 0;
        this.heartPulsePhase = 0;

        // Estado de Trauma Cardíaco por chocar contra Barricadas Básicas (FRAGILE_BARRICADE)
        this.traumaRecoveryTimer = 0;     // Segundos restantes para recuperarse (0 = sano, >0 = herido recuperando BPM)
        this.traumaRecoveryDuration = (this.config.BPM && this.config.BPM.TRAUMA_RECOVERY_SEC) || 12.5;
        this.traumaStartBpm = initialBpm; // BPM al que cayó tras el 1er impacto (la mitad)
        this.traumaHitsCount = 0;         // Golpes recibidos dentro de la ventana actual de 10-15s

        this.bActionTimer = 0;
        this.bLastOutcome = 'NONE';

        this.pursuitDistance = this.config.PURSUIT.INITIAL_DISTANCE;

        this.isAlive = true;
        this.deathReason = '';
        this.deathDetail = '';
        this.deathDiagnostics = null;
        this.deathAdvice = '';
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
     * Aplica el impacto de una barricada de escombros (`FRAGILE_BARRICADE`) al sistema de BPM:
     *  - Si es el 1er golpe (fuera de ventana o sano): baja los BPM a la mitad (50%) e inicia
     *    una recuperación lenta durante 12.5 segundos (10-15s). Sobrevives.
     *  - Si te vuelve a golpear antes de terminar de recuperarte (2do golpe en <12.5s):
     *    baja 70 BPM de golpe y te mata por Colapso Cardíaco / quedarte sin BPMs vitales.
     */
    applyBarricadeTrauma() {
        const bpmCfg = this.config.BPM || {};
        const bands = bpmCfg.BASE_BANDS || [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
        const recoverySec = bpmCfg.TRAUMA_RECOVERY_SEC || 12.5;
        const firstHitFactor = bpmCfg.FIRST_HIT_BPM_FACTOR || 0.5;
        const secondHitDrop = bpmCfg.REPEAT_HIT_BPM_DROP || 70;
        const minSurvivalBpm = bpmCfg.MIN_SURVIVAL_BPM || 45;

        const previousBpm = this.bpm;
        this.bpmStrikeBoost = 0;

        // ¿Ya estaba herido recuperándose de un primer impacto dentro del lapso de 10-15s?
        if (this.traumaRecoveryTimer > 0 && this.traumaHitsCount >= 1) {
            this.traumaHitsCount++;
            const droppedBpm = Math.max(0, previousBpm - secondHitDrop);
            this.bpm = droppedBpm;
            this.baseBpmAnchor = Math.max(20, Math.round(droppedBpm / 10) * 10);

            // Al recibir el 2do impacto en el lapso de 10-15s y caer 70 BPM, colapsa y muere
            if (droppedBpm <= minSurvivalBpm || this.traumaHitsCount >= 2) {
                return {
                    survived: false,
                    hitCountInWindow: this.traumaHitsCount,
                    previousBpm,
                    newBpm: droppedBpm,
                    remainingWindowSec: Number(this.traumaRecoveryTimer.toFixed(1))
                };
            }
        }

        // PRIMER IMPACTO: No te mata, te baja el BPM a la mitad y se va recuperando lentamente en 12.5s
        this.traumaHitsCount = 1;
        this.traumaRecoveryDuration = recoverySec;
        this.traumaRecoveryTimer = recoverySec;

        const rawHalf = Math.round((this.baseBpmAnchor * firstHitFactor) / 10) * 10;
        const clampedHalf = Math.max(bands[0], Math.min(bands[bands.length - 1], rawHalf));
        this.traumaStartBpm = clampedHalf;
        this.baseBpmAnchor = clampedHalf;
        this.bpm = clampedHalf;

        const targetIdx = Math.max(0, bands.indexOf(clampedHalf));
        this.smoothBandIndex = targetIdx;

        return {
            survived: true,
            hitCountInWindow: 1,
            previousBpm,
            newBpm: this.bpm,
            recoverySeconds: recoverySec
        };
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

        // 4. Actualizar monitor cardíaco (incluyendo recuperación lenta si sufrió un choque de barricada)
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

    _updateHeartRateBpm(dt, speedRatio, isHoldingA) {
        const bpmCfg = this.config.BPM || {};
        const bands = bpmCfg.BASE_BANDS || [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
        const maxBandIdx = bands.length - 1; // 180 BPM
        const alertBaseBpm = bpmCfg.INITIAL_ALERT_BPM || 110;
        const alertBandIdx = Math.max(0, bands.indexOf(alertBaseBpm)); // índice de 110 BPM
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
            this.afkIdleTimer = 0;
        } else {
            this.afkIdleTimer += dt;
            if (this.afkIdleTimer >= afkDelaySec) {
                this.cardiacExertion = Math.max(0.0, this.cardiacExertion - afkCooldownRate * dt);
            }
        }

        // 3. Calcular cuál sería la banda normal sin trauma (entre 110 BPM y 180 BPM)
        const normalExertionBandIdx = alertBandIdx + this.cardiacExertion * (maxBandIdx - alertBandIdx);

        let decelPenaltyBands = 0;
        if (this.hasStartedRunning && (!isHoldingA || speedRatio < 0.96)) {
            if (speedRatio >= 0.68) {
                decelPenaltyBands = 1;
            } else if (speedRatio >= 0.20) {
                decelPenaltyBands = 2;
            } else {
                decelPenaltyBands = this.afkIdleTimer < afkDelaySec ? 2 : 0;
            }
        }

        let targetBandFloat = Math.max(alertBandIdx, normalExertionBandIdx - decelPenaltyBands);

        // 4. Si el jugador sufrió un impacto contra una barricada básica (traumaRecoveryTimer > 0),
        //    el BPM sube lentamente desde la mitad (`traumaStartBpm`) hasta su nivel normal durante los 12.5s
        if (this.traumaRecoveryTimer > 0) {
            this.traumaRecoveryTimer = Math.max(0, this.traumaRecoveryTimer - dt);
            if (this.traumaRecoveryTimer === 0) {
                this.traumaHitsCount = 0;
            } else {
                const startIdx = Math.max(0, bands.indexOf(this.traumaStartBpm));
                const recoveryProgress = 1.0 - (this.traumaRecoveryTimer / this.traumaRecoveryDuration);
                targetBandFloat = startIdx + (targetBandFloat - startIdx) * recoveryProgress;
            }
        }

        const diff = targetBandFloat - this.smoothBandIndex;
        if (Math.abs(diff) < 0.03) {
            this.smoothBandIndex = targetBandFloat;
        } else {
            this.smoothBandIndex += diff * Math.min(1, smoothRate * dt);
        }

        let activeBandIdx = Math.round(this.smoothBandIndex);
        if (this.traumaRecoveryTimer <= 0 && decelPenaltyBands > 0 && Math.round(normalExertionBandIdx) > alertBandIdx) {
            activeBandIdx = Math.min(Math.round(normalExertionBandIdx) - 1, activeBandIdx);
        }
        activeBandIdx = Math.max(0, Math.min(maxBandIdx, activeBandIdx));

        const anchor = bands[activeBandIdx];
        this.baseBpmAnchor = anchor;

        // 5. Oscilación viva de monitor entre el número terminado en 0 y su par terminado en 9 (ej. 90 ↔ 89, 180 ↔ 179)
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
