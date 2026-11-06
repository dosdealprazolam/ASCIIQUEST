/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - InteractionSystem (Control B)
 * -------------------------------------------------------------
 * Interpreta el contexto alrededor del jugador cuando pulsa [B]
 * mientras corre. No tiene barra de energía ni cooldown artificial.
 */
window.PSR = window.PSR || {};

class InteractionSystem {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
    }

    /**
     * Evalúa y ejecuta la acción contextual B sobre el entorno cercano.
     */
    executeContextualAction(player, obstacles) {
        if (!player.isAlive) return;

        const minRange = this.config.CONTROLS.B_MIN_RANGE;
        const maxRange = this.config.CONTROLS.B_INTERACTION_RANGE;

        // Buscar el obstáculo interactivo más cercano en el carril del jugador
        let targetObs = null;
        let closestDist = Infinity;

        for (const obs of obstacles) {
            if (!obs.canInteractWithB()) continue;

            const relZ = obs.z - player.z;
            const laneDist = Math.abs(obs.visualLane - player.visualLane);

            if (relZ >= minRange && relZ <= maxRange && laneDist <= 0.55) {
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

        if (outcome === 'MANIPULATED') {
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

    /**
     * Verifica si existe algún obstáculo dentro del rango contextual de B
     * (utilizado para dar tensión física/ambiental sin mostrar carteles de texto).
     */
    getObstacleInContextualRange(player, obstacles) {
        const minRange = this.config.CONTROLS.B_MIN_RANGE;
        const maxRange = this.config.CONTROLS.B_INTERACTION_RANGE;

        for (const obs of obstacles) {
            if (obs.state !== 'ACTIVE') continue;
            const relZ = obs.z - player.z;
            const laneDist = Math.abs(obs.visualLane - player.visualLane);
            if (relZ >= minRange && relZ <= maxRange && laneDist <= 0.55) {
                return obs;
            }
        }
        return null;
    }
}

window.PSR.InteractionSystem = InteractionSystem;
