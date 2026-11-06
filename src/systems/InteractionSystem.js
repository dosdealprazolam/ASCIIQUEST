/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - InteractionSystem (Control B + Masheo)
 * ----------------------------------------------------------------------
 * Interpreta el contexto alrededor del jugador cuando pulsa [B]
 * mientras corre. Soporta masheo rápido de múltiples impactos.
 */
window.PSR = window.PSR || {};

class InteractionSystem {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
    }

    executeContextualAction(player, obstacles) {
        if (!player.isAlive) return;

        const minRange = this.config.CONTROLS.B_MIN_RANGE;
        const maxRange = this.config.CONTROLS.B_INTERACTION_RANGE;

        let targetObs = null;
        let closestDist = Infinity;

        for (const obs of obstacles) {
            if (!obs.canInteractWithB()) continue;

            const relZ = obs.z - player.z;
            const laneDist = Math.abs(obs.visualLane - player.visualLane);

            // Rango ampliado si el obstáculo requiere múltiples golpes de masheo
            const extraMashRange = (obs.requiredHits > 1) ? (obs.requiredHits - 1) * 45 : 0;
            if (relZ >= minRange && relZ <= (maxRange + extraMashRange) && laneDist <= 0.58) {
                if (relZ < closestDist) {
                    closestDist = relZ;
                    targetObs = obs;
                }
            }
        }

        if (!targetObs) {
            player.triggerContextualAction('EMPTY');
            this.eventBus.emit('interaction:empty', { z: player.z, lane: player.lane });
            return;
        }

        const outcome = targetObs.interactWithB();
        player.triggerContextualAction(outcome);

        if (outcome === 'MASH_HIT') {
            this.eventBus.emit('interaction:mash_hit', {
                obstacle: targetObs,
                remainingHits: targetObs.remainingHits,
                requiredHits: targetObs.requiredHits
            });
        } else if (outcome === 'MANIPULATED') {
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
    }

    getObstacleInContextualRange(player, obstacles) {
        const minRange = this.config.CONTROLS.B_MIN_RANGE;
        const maxRange = this.config.CONTROLS.B_INTERACTION_RANGE;

        for (const obs of obstacles) {
            if (obs.state !== 'ACTIVE') continue;
            const relZ = obs.z - player.z;
            const laneDist = Math.abs(obs.visualLane - player.visualLane);
            if (relZ >= minRange && relZ <= maxRange && laneDist <= 0.58) {
                return obs;
            }
        }
        return null;
    }
}

window.PSR.InteractionSystem = InteractionSystem;
