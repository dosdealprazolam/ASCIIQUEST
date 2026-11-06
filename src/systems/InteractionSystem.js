/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - InteractionSystem (2-Golpes Fiables + Telemetría Dev)
 * -------------------------------------------------------------------------------------
 *  1. Garantiza que los obstáculos de 2 golpes (y 3 golpes) siempre reciban cada toque
 *     de [B] sin perder inputs ni bugearse:
 *      - Acumula golpes en el buffer (`bBufferedStrikes`) si masheas [B] un instante
 *        antes de entrar en alcance, descargándolos en cuanto el obstáculo entra en rango.
 *      - Da prioridad máxima al obstáculo que ya tiene daño parcial (`hitsReceived > 0`)
 *        para que el 2do golpe siempre remate ese mismo obstáculo.
 *      - Concede un margen frontal proporcional (`+75u` por capa extra) a los obstáculos
 *        multicapa para que a alta velocidad dé tiempo físico real de dar los 2 golpes.
 */
window.PSR = window.PSR || {};

class InteractionSystem {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
        this.bBufferTimer = 0;
        this.bBufferedStrikes = 0;
        this.recentBAttempts = [];
    }

    reset() {
        this.bBufferTimer = 0;
        this.bBufferedStrikes = 0;
        this.recentBAttempts = [];
    }

    /**
     * Devuelve la distancia de ataque corregida (210 u base, con ajuste ligero por velocidad de nivel).
     */
    getEffectiveRange(player) {
        const baseRange = this.config.CONTROLS.B_INTERACTION_RANGE || 210;
        const speedMult = (player && player.speedMultiplier) ? player.speedMultiplier : 1.0;
        return Math.round(baseRange * (1 + (speedMult - 1) * 0.65));
    }

    executeContextualAction(player, obstacles) {
        if (!player.isAlive) return;

        // Si había golpes acumulados en el buffer por un toque milisegundos antes, sumarlos a este toque
        const totalStrikesToAttempt = 1 + this.bBufferedStrikes;
        let anyHit = false;

        for (let s = 0; s < totalStrikesToAttempt; s++) {
            const hit = this._tryStrikeClosestObstacle(
                player,
                obstacles,
                s === 0 ? 'DIRECT_PRESS' : 'BUFFERED_COMBO'
            );
            if (hit) {
                anyHit = true;
            } else {
                break;
            }
        }

        if (!anyHit) {
            const bufferMs = this.config.CONTROLS.B_BUFFER_WINDOW_MS || 150;
            this.bBufferTimer = bufferMs / 1000;
            this.bBufferedStrikes = Math.min(3, this.bBufferedStrikes + 1);
            player.triggerContextualAction('EMPTY');

            this._recordMissedAttempt(player, obstacles);
            this.eventBus.emit('interaction:empty', { z: player.z, lane: player.lane });
        } else {
            this.bBufferTimer = 0;
            this.bBufferedStrikes = 0;
        }
    }

    update(dt, player, obstacles) {
        if (!player.isAlive || this.bBufferTimer <= 0 || this.bBufferedStrikes <= 0) return;

        this.bBufferTimer = Math.max(0, this.bBufferTimer - dt);
        if (this.bBufferTimer <= 0) {
            this.bBufferedStrikes = 0;
            return;
        }

        while (this.bBufferedStrikes > 0) {
            const hit = this._tryStrikeClosestObstacle(player, obstacles, 'BUFFERED_HIT');
            if (hit) {
                this.bBufferedStrikes--;
                if (this.bBufferedStrikes === 0) {
                    this.bBufferTimer = 0;
                }
            } else {
                break;
            }
        }
    }

    _tryStrikeClosestObstacle(player, obstacles, triggerSource = 'DIRECT_PRESS') {
        const minRange = this.config.CONTROLS.B_MIN_RANGE || -42;
        const maxRange = this.getEffectiveRange(player);
        const TYPES = window.PSR.OBSTACLE_TYPES;

        let targetObs = null;
        let bestScore = Infinity;

        for (const obs of obstacles) {
            if (!obs.canInteractWithB()) continue;

            const relZ = obs.z - player.z;
            const distToTargetLane = Math.abs(obs.visualLane - player.lane);
            const distToVisualLane = Math.abs(obs.visualLane - player.visualLane);
            const laneDist = Math.min(distToTargetLane, distToVisualLane);

            // Si el obstáculo requiere 2 o más golpes, ampliar ligeramente la ventana del 1er golpe
            // (+75u por golpe extra) para que dé tiempo físico de meter el 2do golpe sin bugearse
            const extraMultiHitWindow = (obs.requiredHits > 1) ? (obs.requiredHits - 1) * 75 : 0;

            if (relZ >= minRange && relZ <= (maxRange + extraMultiHitWindow) && laneDist <= 0.70) {
                const lanePenalty = (obs.lane === player.lane) ? 0 : 400;
                const monolithPenalty = (obs.type === TYPES.SOLID_MONOLITH) ? 800 : 0;
                // Si el obstáculo ya tiene 1 golpe adentro (hitsReceived > 0), prioridad absoluta para rematarlo
                const damagedPriorityBonus = (obs.hitsReceived > 0) ? -500 : 0;
                const score = relZ + lanePenalty + monolithPenalty + damagedPriorityBonus;

                if (score < bestScore) {
                    bestScore = score;
                    targetObs = obs;
                }
            }
        }

        if (!targetObs) return false;

        const relZ = targetObs.z - player.z;
        const outcome = targetObs.interactWithB(relZ, this.config);
        player.triggerContextualAction(outcome);

        this._pushAttemptLog({
            timeMs: Math.round(performance.now()),
            source: triggerSource,
            playerZ: Math.round(player.z),
            playerLane: player.lane,
            playerVisualLane: Number(player.visualLane.toFixed(2)),
            effectiveRange: maxRange,
            targetObsId: targetObs.id,
            targetObsType: targetObs.type,
            targetObsLane: targetObs.initialLane,
            relZAtStrike: Math.round(relZ),
            outcome,
            hitsProgress: `${targetObs.hitsReceived}/${targetObs.requiredHits}`,
            remainingHitsAfter: targetObs.remainingHits
        });

        const isTentativeHeavy = targetObs.type === TYPES.TENTATIVE_HEAVY_TOWER;

        if (outcome === 'MASH_HIT') {
            if (isTentativeHeavy) {
                player.applyStructureShoveSlowdown();
            }
            this.eventBus.emit('interaction:mash_hit', {
                obstacle: targetObs,
                remainingHits: targetObs.remainingHits,
                requiredHits: targetObs.requiredHits
            });
        } else if (outcome === 'MANIPULATED') {
            if (isTentativeHeavy) {
                player.applyStructureShoveSlowdown();
            }
            this.eventBus.emit('interaction:manipulated', {
                obstacle: targetObs,
                fromLane: targetObs.initialLane,
                toLane: targetObs.fallTargetLane
            });
        } else if (outcome === 'SHATTERED') {
            this.eventBus.emit('interaction:shattered', {
                obstacle: targetObs,
                lane: targetObs.lane
            });
        } else if (outcome === 'RESISTED') {
            this.eventBus.emit('interaction:resisted', {
                obstacle: targetObs,
                lane: targetObs.lane
            });
        }

        return true;
    }

    _recordMissedAttempt(player, obstacles) {
        const maxRange = this.getEffectiveRange(player);
        let nearestSameLane = null;
        let nearestSameLaneDist = Infinity;
        let nearestAny = null;
        let nearestAnyDist = Infinity;

        for (const obs of obstacles) {
            if (obs.state !== 'ACTIVE') continue;
            const relZ = obs.z - player.z;
            if (relZ < -60) continue;
            if (relZ < nearestAnyDist) {
                nearestAnyDist = relZ;
                nearestAny = obs;
            }
            if (obs.lane === player.lane && relZ < nearestSameLaneDist) {
                nearestSameLaneDist = relZ;
                nearestSameLane = obs;
            }
        }

        let missReason = 'SIN_OBSTACULOS_CERCA';
        if (nearestSameLane && nearestSameLaneDist > maxRange) {
            missReason = `FUERA_DE_RANGO (obstáculo #${nearestSameLane.id} a ${Math.round(nearestSameLaneDist)}u > máx ${maxRange}u)`;
        } else if (nearestAny && nearestAny.lane !== player.lane) {
            missReason = `OTRO_CARRIL (obstáculo #${nearestAny.id} en carril ${nearestAny.lane + 1}, jugador en carril ${player.lane + 1} a ${Math.round(nearestAnyDist)}u)`;
        }

        this._pushAttemptLog({
            timeMs: Math.round(performance.now()),
            source: 'DIRECT_PRESS_MISS',
            playerZ: Math.round(player.z),
            playerLane: player.lane,
            playerVisualLane: Number(player.visualLane.toFixed(2)),
            effectiveRange: maxRange,
            targetObsId: nearestSameLane ? nearestSameLane.id : (nearestAny ? nearestAny.id : null),
            targetObsType: nearestSameLane ? nearestSameLane.type : (nearestAny ? nearestAny.type : 'NONE'),
            targetObsLane: nearestSameLane ? nearestSameLane.lane : (nearestAny ? nearestAny.lane : -1),
            relZAtStrike: Number.isFinite(nearestSameLaneDist)
                ? Math.round(nearestSameLaneDist)
                : (Number.isFinite(nearestAnyDist) ? Math.round(nearestAnyDist) : null),
            outcome: 'EMPTY_BUFFERED',
            missReason
        });
    }

    _pushAttemptLog(entry) {
        this.recentBAttempts.unshift(entry);
        if (this.recentBAttempts.length > 8) {
            this.recentBAttempts.pop();
        }
    }

    getObstacleInContextualRange(player, obstacles) {
        const minRange = this.config.CONTROLS.B_MIN_RANGE || -42;
        const maxRange = this.getEffectiveRange(player);

        for (const obs of obstacles) {
            if (obs.state !== 'ACTIVE') continue;
            const relZ = obs.z - player.z;
            const laneDist = Math.min(
                Math.abs(obs.visualLane - player.lane),
                Math.abs(obs.visualLane - player.visualLane)
            );
            const extraMultiHitWindow = (obs.requiredHits > 1) ? (obs.requiredHits - 1) * 75 : 0;
            if (relZ >= minRange && relZ <= (maxRange + extraMultiHitWindow) && laneDist <= 0.70) {
                return obs;
            }
        }
        return null;
    }
}

window.PSR.InteractionSystem = InteractionSystem;
