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

        // Posición de carril (lógica e interpolada para renderizado/colisión fluida)
        this.lane = defaultLane;
        this.visualLane = defaultLane;
        this.previousLane = defaultLane;

        // Cinemática de carrera
        this.z = 0;                       // Distancia total recorrida
        this.speed = 0;                   // Velocidad actual
        this.stridePhase = 0;             // Fase procedural de zancada

        // Ventana de inercia al soltar A para cambiar de carril con fluidez
        this.lastSustainedRunTime = 0;
        this.hasStartedRunning = false;

        // Estado de la acción contextual B
        this.bActionTimer = 0;
        this.bLastOutcome = 'NONE';       // 'NONE' | 'MANIPULATED' | 'SHATTERED' | 'RESISTED' | 'EMPTY'

        // Presión psicológica (la persecución detrás del corredor)
        this.pursuitDistance = this.config.PURSUIT.INITIAL_DISTANCE;

        // Estado vital
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

    /**
     * Devuelve cuántos milisegundos quedan de la ventana de inercia al soltar A.
     */
    getGraceRemainingMs(now, isHoldingA) {
        if (isHoldingA || !this.hasStartedRunning) return this.config.MOVEMENT.MOMENTUM_GRACE_MS;
        const elapsed = now - this.lastSustainedRunTime;
        return Math.max(0, this.config.MOVEMENT.MOMENTUM_GRACE_MS - elapsed);
    }

    update(dt, now, isHoldingA) {
        if (!this.isAlive) return;

        const mov = this.config.MOVEMENT;
        const pursuitCfg = this.config.PURSUIT;

        // 1. Actualizar velocidad según el Control A
        if (isHoldingA) {
            this.hasStartedRunning = true;
            this.lastSustainedRunTime = now;
            this.speed = Math.min(mov.MAX_RUN_SPEED, this.speed + mov.ACCELERATION * dt);
        } else if (this.hasStartedRunning) {
            const timeSinceRelease = now - this.lastSustainedRunTime;
            if (timeSinceRelease <= mov.MOMENTUM_GRACE_MS) {
                const minGraceSpeed = mov.MAX_RUN_SPEED * 0.72;
                this.speed = Math.max(minGraceSpeed, this.speed - mov.GRACE_DECELERATION * dt);
            } else {
                this.speed = Math.max(0, this.speed - mov.STOP_DECELERATION * dt);
            }
        }

        // 2. Avanzar en el escenario
        this.z += this.speed * dt;

        // 3. Fase de zancada
        const speedRatio = mov.MAX_RUN_SPEED > 0 ? (this.speed / mov.MAX_RUN_SPEED) : 0;
        this.stridePhase += dt * (4.0 + speedRatio * 14.0);

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
            if (speedRatio > 0.75) {
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
