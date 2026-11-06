/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - ObstacleManager
 * -----------------------------------------------
 * Gestiona la aparición por distancia, actualización y reciclaje de obstáculos.
 * También permite generación manual bajo demanda para el Modo Sandbox.
 */
window.PSR = window.PSR || {};

class ObstacleManager {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
        this.obstacles = [];
        this.nextObstacleId = 1;
        this.nextSpawnZ = 520;
        this.autoSpawnEnabled = true;
    }

    reset() {
        this.obstacles = [];
        this.nextObstacleId = 1;
        this.nextSpawnZ = 520;

        if (this.autoSpawnEnabled) {
            this._spawnInitialSequence();
        }
    }

    clearAll(playerZ = 0) {
        this.obstacles = [];
        this.nextSpawnZ = playerZ + 520;
    }

    /**
     * Genera manualmente un obstáculo frente al jugador (usado en el Nivel Sandbox).
     */
    spawnManual(type, lane, playerZ, distanceAhead = 680) {
        const z = playerZ + distanceAhead;
        const fallTarget = type === window.PSR.OBSTACLE_TYPES.COLLAPSING_STRUCTURE
            ? this._pickAdjacentLane(lane)
            : null;

        const obs = new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type,
            lane,
            z,
            fallTargetLane: fallTarget
        });
        this.obstacles.push(obs);
        return obs;
    }

    /**
     * Genera manualmente una formación doble (Estructura Inestable + Monolito) frente al jugador.
     */
    spawnDoubleFormation(playerLane, playerZ, distanceAhead = 720) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const z = playerZ + distanceAhead;
        const adjacentLane = this._pickAdjacentLane(playerLane);
        const fallTarget = this._pickAdjacentLane(playerLane);

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.COLLAPSING_STRUCTURE,
            lane: playerLane,
            z,
            fallTargetLane: fallTarget
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.SOLID_MONOLITH,
            lane: adjacentLane,
            z
        }));
    }

    _spawnInitialSequence() {
        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: window.PSR.OBSTACLE_TYPES.COLLAPSING_STRUCTURE,
            lane: 1,
            z: 520,
            fallTargetLane: 2
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: window.PSR.OBSTACLE_TYPES.SOLID_MONOLITH,
            lane: 1,
            z: 940
        }));

        this.nextSpawnZ = 1360;
    }

    update(dt, player) {
        const spawnDist = this.config.OBSTACLES.SPAWN_DISTANCE;
        const despawnDist = this.config.OBSTACLES.DESPAWN_DISTANCE;

        // 1. Generar nuevos obstáculos si la generación automática está activa
        if (this.autoSpawnEnabled) {
            while (player.z + spawnDist >= this.nextSpawnZ) {
                this._spawnPatternAt(this.nextSpawnZ, player.lane, player.z);
                const progressFactor = Math.min(1, player.z / 25000);
                const spacing = 440 - progressFactor * 130;
                this.nextSpawnZ += spacing;
            }
        } else {
            this.nextSpawnZ = Math.max(this.nextSpawnZ, player.z + 520);
        }

        // 2. Actualizar estado de cada obstáculo y limpiar los que quedaron atrás
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.update(dt, this.config);

            if (obs.state === 'COLLAPSED_IN_OTHER_LANE') {
                this._checkCollateralCrush(obs);
            }

            if (obs.z - player.z < despawnDist) {
                this.obstacles.splice(i, 1);
            }
        }
    }

    _spawnPatternAt(z, playerLane, currentZ) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const roll = Math.random();
        const doubleLaneChance = currentZ > 1800 ? 0.42 : 0.22;

        if (roll < doubleLaneChance) {
            const openLane = Math.floor(Math.random() * 3);
            const blockedLanes = [0, 1, 2].filter(l => l !== openLane);

            const interactiveLane = blockedLanes[0];
            const monolithLane = blockedLanes[1];
            const fallTarget = this._pickAdjacentLane(interactiveLane);

            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: TYPES.COLLAPSING_STRUCTURE,
                lane: interactiveLane,
                z,
                fallTargetLane: fallTarget
            }));

            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: TYPES.SOLID_MONOLITH,
                lane: monolithLane,
                z
            }));
        } else {
            const lane = Math.random() < 0.7 ? playerLane : Math.floor(Math.random() * 3);
            const typeRoll = Math.random();

            if (typeRoll < 0.45) {
                const fallTarget = this._pickAdjacentLane(lane);
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.COLLAPSING_STRUCTURE,
                    lane,
                    z,
                    fallTargetLane: fallTarget
                }));
            } else if (typeRoll < 0.72) {
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.SOLID_MONOLITH,
                    lane,
                    z
                }));
            } else {
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.FRAGILE_BARRICADE,
                    lane,
                    z
                }));
            }
        }
    }

    _pickAdjacentLane(lane) {
        if (lane === 0) return 1;
        if (lane === 2) return 1;
        return Math.random() < 0.5 ? 0 : 2;
    }

    _checkCollateralCrush(toppledObs) {
        for (const other of this.obstacles) {
            if (other.id === toppledObs.id || other.state === 'SHATTERED') continue;
            if (other.lane === toppledObs.lane && Math.abs(other.z - toppledObs.z) < 40) {
                if (other.type === window.PSR.OBSTACLE_TYPES.FRAGILE_BARRICADE) {
                    other.state = 'SHATTERED';
                }
            }
        }
    }
}

window.PSR.ObstacleManager = ObstacleManager;
