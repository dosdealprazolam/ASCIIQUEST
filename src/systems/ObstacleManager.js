/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - ObstacleManager (Ruta de 10,000m con Curva Progresiva Sin Picos Abruptos)
 * ---------------------------------------------------------------------------------------------------------
 *  - Ruta duplicada a 10,000 metros (5 niveles de 2,000 metros cada uno).
 *  - Primeros 500 metros (z <= 5000): Exclusivamente el obstáculo más básico (`FRAGILE_BARRICADE`
 *    de 1 golpe) con ritmo dinámico entre carriles para enganchar desde el inicio.
 *  - De 500m a 5000m+ (y hasta los 10,000m): Curva de progresión interpolada metro a metro
 *    para que los muros amarillos, las barricadas de 2 golpes, las formaciones dobles y los
 *    monolitos entren de forma gradual y orgánica, sin picos bruscos que rompan el flow.
 */
window.PSR = window.PSR || {};

class ObstacleManager {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
        this.obstacles = [];
        this.nextObstacleId = 1;
        this.nextSpawnZ = 500;
        this.autoSpawnEnabled = true;

        this.currentLevel = 1;
        this.forcedLevel = null;
        this.lastSpawnedLane = -1;
        this.consecutiveSameLaneCount = 0;
    }

    reset() {
        this.obstacles = [];
        this.nextObstacleId = 1;
        this.nextSpawnZ = 500;
        this.currentLevel = this.forcedLevel || 1;
        this.lastSpawnedLane = -1;
        this.consecutiveSameLaneCount = 0;

        if (this.autoSpawnEnabled) {
            this._spawnInitialSequence();
        }
    }

    clearAll(playerZ = 0) {
        this.obstacles = [];
        this.nextSpawnZ = playerZ + 500;
    }

    getLevelForDistance(z) {
        if (this.forcedLevel !== null) return this.forcedLevel;
        const meters = Math.floor(z / 10);
        const metersPerLevel = this.config.DIFFICULTY.METERS_PER_LEVEL || 2000;
        const maxLevel = this.config.DIFFICULTY.MAX_LEVEL || 5;
        const computed = Math.floor(meters / metersPerLevel) + 1;
        return Math.min(maxLevel, Math.max(1, computed));
    }

    getLevelConfig(level = this.currentLevel) {
        const levels = this.config.DIFFICULTY.LEVELS;
        const idx = Math.min(levels.length - 1, Math.max(0, level - 1));
        return levels[idx];
    }

    /**
     * Barra psicológica por cada 1000m:
     *  - Sube hacia el 100% conforme avanzas cada 1000m.
     *  - Apenas alcanzas 1000m cae en picada hasta 10%, a los 2000m cae hasta 20%,
     *    a los 3000m cae hasta 30%... y así sucesivamente hasta llegar a 10000m (100%).
     */
    getKilometerBarProgress(distMeters) {
        const goalMeters = (this.config.DIFFICULTY && this.config.DIFFICULTY.RACE_GOAL_METERS) || 10200;
        const m = Math.max(0, distMeters);
        if (m >= goalMeters) return 100;

        if (m >= 9000) {
            const finalSpan = Math.max(1, goalMeters - 9000);
            return 90 + ((m - 9000) / finalSpan) * 10;
        }

        const kmIndex = Math.floor(m / 1000); // 0..8
        const floorPct = kmIndex * 10;         // 0%, 10%, 20%, ..., 80%
        const progressInKm = (m % 1000) / 1000;
        return floorPct + progressInKm * (100 - floorPct);
    }

    /**
     * Calcula una interpolación suave dentro del nivel actual para evitar picos bruscos
     * tanto en las probabilidades de aparición como en el espaciado.
     */
    getSmoothParamsAtZ(z) {
        const lvl = this.getLevelForDistance(z);
        const currCfg = this.getLevelConfig(lvl);
        if (this.forcedLevel !== null) {
            return {
                level: lvl,
                spawnSpacing: currCfg.spawnSpacing,
                doubleLaneChance: currCfg.doubleLaneChance,
                monolithChance: currCfg.monolithChance,
                collapsingChance: currCfg.collapsingChance,
                twoHitChance: currCfg.maxHits > 1 ? 0.55 : 0,
                maxHits: currCfg.maxHits
            };
        }

        const meters = z / 10;
        const metersPerLevel = this.config.DIFFICULTY.METERS_PER_LEVEL || 2000;
        const prevCfg = lvl > 1 ? this.getLevelConfig(lvl - 1) : {
            spawnSpacing: 510,
            doubleLaneChance: 0.0,
            monolithChance: 0.0,
            collapsingChance: 0.08,
            maxHits: 1
        };

        // En Nivel 1 (0m a 2000m), los primeros 500m son 100% básicos, y de 500m a 2000m sube suavemente
        let t = 0;
        if (lvl === 1) {
            t = Math.max(0, Math.min(1, (meters - 500) / (metersPerLevel - 500)));
        } else {
            const levelStartMeters = (lvl - 1) * metersPerLevel;
            t = Math.max(0, Math.min(1, (meters - levelStartMeters) / metersPerLevel));
        }

        const lerp = (a, b, f) => a + (b - a) * f;

        return {
            level: lvl,
            spawnSpacing: Math.round(lerp(prevCfg.spawnSpacing, currCfg.spawnSpacing, t)),
            doubleLaneChance: lerp(prevCfg.doubleLaneChance, currCfg.doubleLaneChance, t),
            monolithChance: lerp(prevCfg.monolithChance, currCfg.monolithChance, t),
            collapsingChance: lerp(prevCfg.collapsingChance, currCfg.collapsingChance, t),
            // En niveles con maxHits >= 2, la probabilidad de que salga de 2 golpes también sube gradualmente (de 25% a 65%)
            twoHitChance: currCfg.maxHits > 1 ? lerp(0.25, 0.68, t) : 0,
            maxHits: currCfg.maxHits,
            minHits: currCfg.minHits
        };
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
            requiredHits: 1
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.SOLID_MONOLITH,
            lane: adjacentLane,
            z,
            requiredHits: hits
        }));
    }

    /**
     * Secuencia inicial dentro de los primeros 500 metros:
     * Solo el obstáculo más básico (FRAGILE_BARRICADE de 1 golpe) pero con ritmo enganchante.
     */
    _spawnInitialSequence() {
        const TYPES = window.PSR.OBSTACLE_TYPES;

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.FRAGILE_BARRICADE,
            lane: 1,
            z: 500,
            requiredHits: 1
        }));

        this.obstacles.push(new window.PSR.Obstacle({
            id: this.nextObstacleId++,
            type: TYPES.FRAGILE_BARRICADE,
            lane: 2,
            z: 1000,
            requiredHits: 1
        }));

        this.nextSpawnZ = 1490;
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
                const smooth = this.getSmoothParamsAtZ(this.nextSpawnZ);
                this._spawnPatternAt(this.nextSpawnZ, player.lane, smooth);

                // En los primeros 500m (z <= 5000), el espaciado baja suavemente de 500 a 465
                // para mantener al jugador enganchado y activo sin ningún pico brusco
                let spacing = smooth.spawnSpacing;
                if (this.nextSpawnZ <= 5000 && this.forcedLevel === null) {
                    const introProgress = Math.max(0, Math.min(1, this.nextSpawnZ / 5000));
                    spacing = Math.round(500 - introProgress * 35);
                }
                this.nextSpawnZ += spacing;
            }
        } else {
            this.nextSpawnZ = Math.max(this.nextSpawnZ, player.z + 500);
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

    _rollHits(lvlCfgOrSmooth) {
        const minH = lvlCfgOrSmooth.minHits || 1;
        const maxH = lvlCfgOrSmooth.maxHits || 1;
        if (maxH <= minH) return minH;
        if (typeof lvlCfgOrSmooth.twoHitChance === 'number') {
            return Math.random() < lvlCfgOrSmooth.twoHitChance ? maxH : minH;
        }
        return minH + Math.floor(Math.random() * (maxH - minH + 1));
    }

    _pickBalancedLane(playerLane, preferPlayerLaneChance = 0.55) {
        let chosen;
        if (Math.random() < preferPlayerLaneChance) {
            chosen = playerLane;
        } else {
            const otherLanes = [0, 1, 2].filter(l => l !== this.lastSpawnedLane);
            chosen = otherLanes.length > 0
                ? otherLanes[Math.floor(Math.random() * otherLanes.length)]
                : Math.floor(Math.random() * 3);
        }

        // Prevenir rachas de más de 2 obstáculos en el mismo carril
        if (chosen === this.lastSpawnedLane) {
            this.consecutiveSameLaneCount++;
            if (this.consecutiveSameLaneCount >= 2) {
                const altLanes = [0, 1, 2].filter(l => l !== chosen);
                chosen = altLanes[Math.floor(Math.random() * altLanes.length)];
                this.consecutiveSameLaneCount = 1;
            }
        } else {
            this.lastSpawnedLane = chosen;
            this.consecutiveSameLaneCount = 1;
        }

        return chosen;
    }

    _spawnPatternAt(z, playerLane, smooth) {
        const TYPES = window.PSR.OBSTACLE_TYPES;

        // REGLA ESTRICTA: Los primeros 500 metros (z <= 5000) SOLO tienen el obstáculo más básico
        // (FRAGILE_BARRICADE de 1 golpe), alternando dinámicamente entre carriles para evitar monotonía.
        if (z <= 5000 && this.forcedLevel === null) {
            const lane = this._pickBalancedLane(playerLane, 0.52);
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

        if (roll < smooth.doubleLaneChance) {
            const openLane = Math.floor(Math.random() * 3);
            const blockedLanes = [0, 1, 2].filter(l => l !== openLane);
            this.lastSpawnedLane = -1; // Patrón doble ocupa dos carriles
            this.consecutiveSameLaneCount = 0;

            const firstLane = blockedLanes[0];
            const secondLane = blockedLanes[1];
            const fallTarget = this._pickAdjacentLane(firstLane);
            const hits = this._rollHits(smooth);

            const isTower = Math.random() < 0.52;
            const isRareTower = isTower && this._isRareRightRoll(z, firstLane, fallTarget);
            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: isTower ? TYPES.COLLAPSING_STRUCTURE : TYPES.FRAGILE_BARRICADE,
                lane: firstLane,
                z,
                fallTargetLane: isTower ? fallTarget : null,
                requiredHits: isTower ? 1 : hits,
                isRareRightVariant: isRareTower
            }));

            const secondIsMonolith = smooth.monolithChance > 0 && Math.random() < Math.min(0.65, smooth.monolithChance * 1.8);
            this.obstacles.push(new window.PSR.Obstacle({
                id: this.nextObstacleId++,
                type: secondIsMonolith ? TYPES.SOLID_MONOLITH : TYPES.FRAGILE_BARRICADE,
                lane: secondLane,
                z,
                requiredHits: secondIsMonolith ? 1 : this._rollHits(smooth)
            }));
        } else {
            const lane = this._pickBalancedLane(playerLane, 0.55);
            const typeRoll = Math.random();
            const hits = this._rollHits(smooth);

            if (typeRoll < smooth.monolithChance) {
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.SOLID_MONOLITH,
                    lane,
                    z,
                    requiredHits: 1
                }));
            } else if (typeRoll < smooth.monolithChance + smooth.collapsingChance) {
                const fallTarget = this._pickAdjacentLane(lane);
                const isRare = this._isRareRightRoll(z, lane, fallTarget);
                this.obstacles.push(new window.PSR.Obstacle({
                    id: this.nextObstacleId++,
                    type: TYPES.COLLAPSING_STRUCTURE,
                    lane,
                    z,
                    fallTargetLane: fallTarget,
                    requiredHits: 1,
                    isRareRightVariant: isRare
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

    /**
     * Determina si una estructura que cae a la derecha se convierte en la variante rara especial.
     * Disponible a partir de los 2,000 metros (z >= 20000) con probabilidad calibrada (~20%).
     */
    _isRareRightRoll(z, originLane, targetLane) {
        if (targetLane <= originLane) return false;
        const minDistanceMeters = (this.config.OBSTACLES && this.config.OBSTACLES.YELLOW_RIGHT_RARE_MIN_DISTANCE_METERS) || 2000;
        if (z < minDistanceMeters * 10) return false;
        const chance = (this.config.OBSTACLES && typeof this.config.OBSTACLES.YELLOW_RIGHT_RARE_CHANCE === 'number')
            ? this.config.OBSTACLES.YELLOW_RIGHT_RARE_CHANCE
            : 0.20;
        return Math.random() < chance;
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
