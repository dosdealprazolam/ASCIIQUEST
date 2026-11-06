/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - CollisionSystem
 * -----------------------------------------------
 * Evalúa colisiones letales con precisión y determina la causa exacta
 * de muerte ("El jugador debe entender por qué murió").
 */
window.PSR = window.PSR || {};

class CollisionSystem {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
    }

    update(player, obstacles) {
        if (!player.isAlive) return;

        const halfDepth = this.config.OBSTACLES.PLAYER_HITBOX_DEPTH * 0.5;
        const laneTolerance = this.config.OBSTACLES.LANE_TOLERANCE;

        for (const obs of obstacles) {
            if (!obs.isLethal()) continue;

            const relZ = obs.z - player.z;
            const zOverlap = Math.abs(relZ) <= (halfDepth + obs.depth * 0.42);

            if (zOverlap) {
                if (obs.state === 'TOPPLING' && obs.toppleProgress < 0.35) {
                    continue;
                }

                const effectiveObsLane = obs.state === 'ACTIVE' ? obs.lane : obs.visualLane;
                const laneDist = Math.abs(player.visualLane - effectiveObsLane);

                if (laneDist <= laneTolerance) {
                    if (player.sandboxImmortal) {
                        if (!obs.sandboxHitTriggered) {
                            obs.sandboxHitTriggered = true;
                            const { reason, detail } = this._buildDeathDiagnosis(obs);
                            player.die(reason, detail);
                        }
                        continue;
                    }
                    const { reason, detail } = this._buildDeathDiagnosis(obs);
                    player.die(reason, detail);
                    return;
                }
            }

            if (!obs.nearMissTriggered && relZ < -halfDepth) {
                obs.nearMissTriggered = true;
                this.eventBus.emit('collision:survived_obstacle', {
                    obstacle: obs
                });
            }
        }
    }

    _buildDeathDiagnosis(obs) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const laneNames = this.config.LANES.NAMES;

        if (obs.type === TYPES.COLLAPSING_STRUCTURE) {
            if (obs.state === 'ACTIVE') {
                return {
                    reason: 'IMPACTO CONTRA ESTRUCTURA INESTABLE',
                    detail: `Podías empujarla hacia el carril ${laneNames[obs.fallTargetLane]} pulsando [B] o cambiar de carril con [A].`
                };
            }
            return {
                reason: 'APLASTADO POR DERRUMBE PROVOCADO',
                detail: `Empujaste la estructura hacia el carril ${laneNames[obs.fallTargetLane]} y te metiste en su trayectoria.`
            };
        }

        if (obs.type === TYPES.SOLID_MONOLITH) {
            return {
                reason: 'IMPACTO CONTRA MONOLITO INDESTRUCTIBLE',
                detail: 'Los bloques macizos no ceden ante [B]. Debías soltar [A], dar 1 o 2 toques y volver a mantener [A].'
            };
        }

        if (obs.type === TYPES.FRAGILE_BARRICADE) {
            return {
                reason: 'IMPACTO CONTRA BARRICADA DE ESCOMBROS',
                detail: 'Debías destrozarla a tiempo con [B] mientras corrías o esquivarla con [A].'
            };
        }

        return {
            reason: 'COLISIÓN MORTAL',
            detail: 'No reaccionaste a tiempo ante el obstáculo.'
        };
    }
}

window.PSR.CollisionSystem = CollisionSystem;
