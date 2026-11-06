/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - ObstacleManager (Primeros 500m Básicos + 5 Niveles)
 * -----------------------------------------------------------------------------------
 *  - Primeros 500 metros (z <= 5000): EXCLUSIVAMENTE el obstáculo más básico
 *    (`FRAGILE_BARRICADE` de 1 solo golpe en un carril) para adaptación limpia del cerebro.
 *  - De 500m a 1000m: Se incorporan las estructuras derrumbables del Nivel 1.
 *  - Cada 1000m: Sube el nivel de intensidad (Niveles 1 a 5).
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

        this.currentLevel = 1;
        this.forcedLevel = null;
    }

    reset() {
        this.obstacles = [];
        this.nextObstacleId = 1;
        this.nextSpawnZ = 520;
        this.currentLevel = this.forcedLevel || 1;

        if (this.autoSpawnEnabled) {
            this._spawnInitialSequence();
        }
    }

    clearAll(playerZ = 0) {
        this.obstacles = [];
        this.nextSpawnZ = playerZ + 520;
    }

    getLevelForDistance(z) {
        if (this.forcedLevel !== null) return this.forcedLevel;
        const meters = Math.floor(z / 10);
        const metersPerLevel = this.config.DIFFICULTY.METERS_PER_LEVEL || 1000;
        const maxLevel = this.config.DIFFICULTY.MAX_LEVEL || 5;
        const computed = Math.floor(meters / metersPerLevel) + 1;
        return Math.min(maxLevel, Math.max(1, computed));
    }

    getLevelConfig(level = this.currentLevel) {
        const levels = this.config.DIFFICULTY.LEVELS;
        const idx = Math.min(levels.length - 1, Math.max(0, level - 1));
        return levels[idx];
    }

    spawnManual(type, lane, playerZ, distanceAhead = 680, requiredHits = 1) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const z = playerZ + distanceAhead;
        const needsFallTarget = (
            type === TYPES.COLLAPSING_STRUCTURE ||
            type === TYPES.TENTATIVE_HEAVY_TOWER
        );
        const fallTarget = needsFallTarget ? this._pickAdjacentLane(lane) : null;

        const obs = new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type,
            lane,
            z,
            fallTargetLane: fallTarget,
            requiredHits
        });
        this.obstacles.push(obs);
        return obs;
    }

    spawnDoubleFormation(playerLane, playerZ, distanceAhead = 720) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const z = playerZ + distanceAhead;
        const adjacentLane = this._pickAdjacentLane(playerLane);
        const fallTarget = this._pickAdjacentLane(playerLane);
        const lvlCfg = this.getLevelConfig(this.currentLevel);
        const hits = this._rollHits(lvlCfg);

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.COLLAPSING_STRUCTURE,
            lane: playerLane,
            z,
            fallTargetLane: fallTarget,
            requiredHits: hits
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.SOLID_MONOLITH,
            lane: adjacentLane,
            z,
            requiredHits: 1
        }));
    }

    /**
     * Secuencia inicial dentro de los primeros 500 metros:
     * Solo el obstáculo más básico (FRAGILE_BARRICADE de 1 golpe).
     */
    _spawnInitialSequence() {
        const TYPES = window.PSR.OBSTACLE_TYPES;

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.FRAGILE_BARRICADE,
            lane: 1,
            z: 520,
            requiredHits: 1
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.FRAGILE_BARRICADE,
            lane: 2,
            z: 1080,
            requiredHits: 1
        }));

        this.nextSpawnZ = 1640;
    }

    update(dt, player) {
        const spawnDist = this.config.OBSTACLES.SPAWN_DISTANCE;
        const despawnDist = this.config.OBSTACLES.DESPAWN_DISTANCE;

        const targetLevel = this.getLevelForDistance(player.z);
        if (targetLevel !== this.currentLevel) {
            this.currentLevel = targetLevel;
            const lvlCfg = this.getLevelConfig(this.currentLevel);
            player.speedMultiplier = lvlCfg.speedMultiplier;

            this.eventBus.emit('difficulty:level_up', {
                level: this.currentLevel,
                config: lvlCfg,
                distanceMeters: Math.floor(player.z / 10)
            });
        } else {
            const lvlCfg = this.getLevelConfig(this.currentLevel);
            player.speedMultiplier = lvlCfg.speedMultiplier;
        }

        if (this.autoSpawnEnabled) {
            while (player.z + spawnDist >= this.nextSpawnZ) {
                const lvlAtSpawn = this.getLevelForDistance(this.nextSpawnZ);
                const lvlCfg = this.getLevelConfig(lvlAtSpawn);
                this._spawnPatternAt(this.nextSpawnZ, player.lane, lvlCfg);
                // En los primeros 500m (z <= 5000), espaciado limpio y constante
                const spacing = (this.nextSpawnZ <= 5000 && this.forcedLevel === null)
                    ? 540
                    : lvlCfg.spawnSpacing;
                this.nextSpawnZ += spacing;
            }
        } else {
            this.nextSpawnZ = Math.max(this.nextSpawnZ, player.z + 520);
        }

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

    _rollHits(lvlCfg) {
        const minH = lvlCfg.minHits || 1;
        const maxH = lvlCfg.maxHits || 1;
        if (maxH <= minH) return minH;
        return minH + Math.floor(Math.random() * (maxH - minH + 1));
    }

    _spawnPatternAt(z, playerLane, lvlCfg) {
        const TYPES = window.PSR.OBSTACLE_TYPES;

        // REGLA ESTRICTA: Los primeros 500 metros (z <= 5000) SOLO tienen el obstáculo más básico
        // (FRAGILE_BARRICADE de 1 golpe en un solo carril).
        if (z <= 5000 && this.forcedLevel === null) {
            const lane = Math.random() < 0.68 ? playerLane : Math.floor(Math.random() * 3);
            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: TYPES.FRAGILE_BARRICADE,
                lane,
                z,
                requiredHits: 1
            }));
            return;
        }

        const roll = Math.random();

        if (roll < lvlCfg.doubleLaneChance) {
            const openLane = Math.floor(Math.random() * 3);
            const blockedLanes = [0, 1, 2].filter(l => l !== openLane);

            const firstLane = blockedLanes[0];
            const secondLane = blockedLanes[1];
            const fallTarget = this._pickAdjacentLane(firstLane);
            const hits = this._rollHits(lvlCfg);

            const isTower = Math.random() < 0.55;
            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: isTower ? TYPES.COLLAPSING_STRUCTURE : TYPES.FRAGILE_BARRICADE,
                lane: firstLane,
                z,
                fallTargetLane: isTower ? fallTarget : null,
                requiredHits: hits
            }));

            const secondIsMonolith = lvlCfg.monolithChance > 0 && Math.random() < 0.65;
            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: secondIsMonolith ? TYPES.SOLID_MONOLITH : TYPES.FRAGILE_BARRICADE,
                lane: secondLane,
                z,
                requiredHits: secondIsMonolith ? 1 : this._rollHits(lvlCfg)
            }));
        } else {
            const lane = Math.random() < 0.76 ? playerLane : Math.floor(Math.random() * 3);
            const typeRoll = Math.random();
            const hits = this._rollHits(lvlCfg);

            if (typeRoll < lvlCfg.monolithChance) {
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.SOLID_MONOLITH,
                    lane,
                    z,
                    requiredHits: 1
                }));
            } else if (typeRoll < lvlCfg.monolithChance + lvlCfg.collapsingChance) {
                const fallTarget = this._pickAdjacentLane(lane);
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.COLLAPSING_STRUCTURE,
                    lane,
                    z,
                    fallTargetLane: fallTarget,
                    requiredHits: hits
                }));
            } else {
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.FRAGILE_BARRICADE,
                    lane,
                    z,
                    requiredHits: hits
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
