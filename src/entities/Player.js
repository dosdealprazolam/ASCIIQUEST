/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Player (El Corredor)
 * ------------------------------------------------------------
 * Representa al personaje jugable.
 * Filosofía central: "EL PERSONAJE NO PROGRESA. EL JUGADOR SÍ."
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
        this.speedMultiplier = 1.0;       // Escalado por los 5 niveles de intensidad del escenario
        this.stridePhase = 0;

        this.lastSustainedRunTime = 0;
        this.hasStartedRunning = false;

        this.bActionTimer = 0;
        this.bLastOutcome = 'NONE';

        this.pursuitDistance = this.config.PURSUIT.INITIAL_DISTANCE;

        this.isAlive = true;
        this.deathReason = '';
        this.deathDetail = '';
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

        // 1. Actualizar velocidad según el Control A
        if (isHoldingA) {
            this.hasStartedRunning = true;
            this.lastSustainedRunTime = now;
            this.speed = Math.min(effectiveMaxSpeed, this.speed + mov.ACCELERATION * this.speedMultiplier * dt);
        } else if (this.hasStartedRunning) {
            const timeSinceRelease = now - this.lastSustainedRunTime;
            if (timeSinceRelease <= mov.MOMENTUM_GRACE_MS) {
                const minGraceSpeed = effectiveMaxSpeed * 0.75;
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

        // 4. Interpolación rápida y precisa entre carriles
        const laneDiff = this.lane - this.visualLane;
        if (Math.abs(laneDiff) < 0.005) {
            this.visualLane = this.lane;
        } else {
            this.visualLane += laneDiff * Math.min(1, this.config.LANES.SWITCH_LERP_SPEED * dt);
        }

        // 5. Temporizador visual de la acción contextual B
        if (this.bActionTimer > 0) {
            this.bActionTimer = Math.max(0, this.bActionTimer - dt);
        }

        // 6. Presión de la persecución
        if (this.hasStartedRunning) {
            if (speedRatio > 0.72) {
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
                        'Dejaste de mantener [A] demasiado tiempo. No puedes detenerte.'
                    );
                }
            }
        }
    }

    die(reason, detail) {
        if (this.sandboxImmortal) {
            this.eventBus.emit('sandbox:collision_impact', {
                reason,
                detail,
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
            distance: Math.floor(this.z / 10)
        });
    }
}

window.PSR.Player = Player;
