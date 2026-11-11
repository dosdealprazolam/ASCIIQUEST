/**
 * ============================================================================
 * PSYCHOLOGICAL SURVIVAL RUNNER — MÓDULO MULTIJUGADOR LOCAL (2 JUGADORES)
 * ============================================================================
 * Módulo 100% independiente y desacoplado del modo individual/sandbox.
 *
 * Características:
 *  - 2 Jugadores en el mismo teclado con controles simultáneos de CERO DELAY:
 *      * Jugador 1: Tecla [A] (Mantener corre / Micro-soltado <0.25s cambia carril)
 *                   Tecla [F] (Acción B / Golpe)
 *      * Jugador 2: Tecla [H] (Mantener corre / Micro-soltado <0.25s cambia carril)
 *                   Tecla [L] (Acción B / Golpe)
 *  - 6 Carriles en total:
 *      * Carriles 1 al 3 (índices 0, 1, 2): Zona exclusiva del Jugador 1.
 *      * Carriles 4 al 6 (índices 3, 4, 5): Zona exclusiva del Jugador 2.
 *  - Línea Central Divisoria: Línea negra sólida y gruesa que divide la pista
 *    física y visualmente, impidiendo invadir el lado del rival.
 *  - Sistema de 3 Vidas independientes con HUD dual y eliminación individual.
 */

(function () {
    'use strict';

    // Constantes del Modo Multijugador
    const MP_CONFIG = {
        LANES: {
            COUNT: 6,
            P1_LANES: [0, 1, 2],
            P2_LANES: [3, 4, 5],
            P1_DEFAULT: 1,
            P2_DEFAULT: 4,
            NAMES: [
                'C1 (P1-IZQ)', 'C2 (P1-CEN)', 'C3 (P1-DER)',
                'C4 (P2-IZQ)', 'C5 (P2-CEN)', 'C6 (P2-DER)'
            ],
            LERP_SPEED: 24.0
        },
        MOVEMENT: {
            MAX_SPEED: 820,
            ACCELERATION: 2800,
            DECELERATION: 1600,
            MICRO_RELEASE_MAX_MS: 250 // < 0.25s para detectar micro-soltado y cambio de carril instantáneo
        },
        COMBAT: {
            INITIAL_LIVES: 3,
            INVULNERABLE_DURATION: 1.25, // Segundos de gracia tras perder vida
            INTERACTION_RANGE: 215,      // Rango de golpe [F] y [L]
            HIT_COOLDOWN_MS: 160
        },
        OBSTACLES: {
            SPAWN_INTERVAL_METERS: 28,
            TYPES: {
                TOWER: 'TOWER',         // Se derrumba hacia un carril de su misma zona
                BARRICADE: 'BARRICADE', // Destructible
                MONOLITH: 'MONOLITH'    // Indestructible (solo esquivar)
            }
        },
        VISUALS: {
            HORIZON_Z: 2800,
            TRACK_MAX_WIDTH: 1180
        }
    };

    class MultiplayerGame {
        constructor() {
            this.canvas = document.getElementById('multiplayer-canvas');
            this.ctx = this.canvas.getContext('2d');

            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            // Estado de Jugador 1
            this.p1 = {
                id: 1,
                name: 'JUGADOR 1',
                lane: MP_CONFIG.LANES.P1_DEFAULT,
                visualLane: MP_CONFIG.LANES.P1_DEFAULT,
                speed: 0,
                z: 0,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isHoldingRun: false,
                lastReleaseTime: 0,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                pursuitDistance: 1000,
                color: '#2ec4b6',
                accentColor: '#5eead4',
                stridePhase: 0
            };

            // Estado de Jugador 2
            this.p2 = {
                id: 2,
                name: 'JUGADOR 2',
                lane: MP_CONFIG.LANES.P2_DEFAULT,
                visualLane: MP_CONFIG.LANES.P2_DEFAULT,
                speed: 0,
                z: 0,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isHoldingRun: false,
                lastReleaseTime: 0,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                pursuitDistance: 1000,
                color: '#ff9f1c',
                accentColor: '#fde68a',
                stridePhase: 0
            };

            this.obstacles = [];
            this.particles = [];
            this.nextObsId = 1;
            this.nextSpawnZ = 450;
            this.totalDistanceMeters = 0;
            this.isMatchOver = false;

            this.lastFrameTime = performance.now();
            this.running = false;

            // Elementos del DOM HUD
            this.dom = {
                p1Lives: document.getElementById('p1-lives-icons'),
                p2Lives: document.getElementById('p2-lives-icons'),
                p1Bpm: document.getElementById('p1-bpm-val'),
                p2Bpm: document.getElementById('p2-bpm-val'),
                p1PursuitBar: document.getElementById('p1-pursuit-bar'),
                p2PursuitBar: document.getElementById('p2-pursuit-bar'),
                p1StatusText: document.getElementById('p1-status-text'),
                p2StatusText: document.getElementById('p2-status-text'),
                p1Banner: document.getElementById('p1-elimination-banner'),
                p2Banner: document.getElementById('p2-elimination-banner'),
                distanceText: document.getElementById('mp-distance-val'),
                gameoverOverlay: document.getElementById('mp-gameover-overlay'),
                winnerAnnouncement: document.getElementById('mp-winner-announcement'),
                statsSummary: document.getElementById('mp-stats-summary'),
                btnRestart: document.getElementById('mp-btn-restart')
            };

            this._loadAssets();
            this._setupCanvas();
            this._bindKeyboardEvents();
            this._bindUIEvents();
        }

        _loadAssets() {
            this.sprites = {
                rightTowers: ['img/obstacle_yellow_right.png', 'img/obstacle_yellow_right_2.png'],
                leftTowers: [
                    'img/obstacle_yellow_left.png',
                    'img/obstacle_yellow_left_2.png',
                    'img/obstacle_yellow_left_3.png',
                    'img/obstacle_yellow_left_4.png'
                ],
                barricades: ['img/barricade_intact.png', 'img/05.png'],
                barricadeDestroyed: ['img/barricade_destroyed.png', 'img/06.png']
            };

            this.loadedImages = {};
            const allPaths = [
                ...this.sprites.rightTowers,
                ...this.sprites.leftTowers,
                ...this.sprites.barricades,
                ...this.sprites.barricadeDestroyed,
                'img/corazon.png'
            ];

            allPaths.forEach(path => {
                const img = new Image();
                img.src = path;
                this.loadedImages[path] = img;
            });
        }

        _setupCanvas() {
            const resize = () => {
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                this.canvas.width = this.width * this.dpr;
                this.canvas.height = this.height * this.dpr;
                this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            };
            window.addEventListener('resize', resize);
            resize();
        }

        _bindKeyboardEvents() {
            window.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                const now = performance.now();

                // === JUGADOR 1: TECLAS [A] Y [F] ===
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    this._handleP1KeyDownA(now);
                } else if (e.code === 'KeyF') {
                    e.preventDefault();
                    this._handleP1KeyDownF(now);
                }

                // === JUGADOR 2: TECLAS [H] Y [L] ===
                else if (e.code === 'KeyH') {
                    e.preventDefault();
                    this._handleP2KeyDownH(now);
                } else if (e.code === 'KeyL') {
                    e.preventDefault();
                    this._handleP2KeyDownL(now);
                }

                // Reinicio global con tecla [R]
                else if (e.code === 'KeyR') {
                    if (this.isMatchOver) {
                        this.restartMatch();
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                const now = performance.now();
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    this._handleP1KeyUpA(now);
                } else if (e.code === 'KeyH') {
                    e.preventDefault();
                    this._handleP2KeyUpH(now);
                }
            });
        }

        _bindUIEvents() {
            if (this.dom.btnRestart) {
                this.dom.btnRestart.addEventListener('click', () => {
                    this.restartMatch();
                });
            }
        }

        // ====================================================================
        // TAREA 1: CONTROLES SIMULTÁNEOS CERO DELAY (Micro-soltado < 0.25s)
        // ====================================================================

        _handleP1KeyDownA(now) {
            if (!this.p1.isAlive) return;

            const timeSinceRelease = now - this.p1.lastReleaseTime;
            // Si fue soltada por un instante menor a 0.25s (micro-soltado), cambia instantáneamente de carril
            if (this.p1.lastReleaseTime > 0 && timeSinceRelease <= MP_CONFIG.MOVEMENT.MICRO_RELEASE_MAX_MS) {
                // Ciclo instantáneo dentro de su zona (Carril 1 [0] -> Carril 2 [1] -> Carril 3 [2])
                this.p1.lane = (this.p1.lane + 1) % 3;
            }

            this.p1.isHoldingRun = true;
        }

        _handleP1KeyUpA(now) {
            if (!this.p1.isAlive) return;
            this.p1.lastReleaseTime = now;
            this.p1.isHoldingRun = false;
        }

        _handleP1KeyDownF(now) {
            if (!this.p1.isAlive) return;
            this.p1.bActionTimer = 0.16;
            this._processPlayerHit(this.p1);
        }

        _handleP2KeyDownH(now) {
            if (!this.p2.isAlive) return;

            const timeSinceRelease = now - this.p2.lastReleaseTime;
            // Si fue soltada por un instante menor a 0.25s (micro-soltado), cambia instantáneamente de carril
            if (this.p2.lastReleaseTime > 0 && timeSinceRelease <= MP_CONFIG.MOVEMENT.MICRO_RELEASE_MAX_MS) {
                // Ciclo instantáneo dentro de su zona (Carril 4 [3] -> Carril 5 [4] -> Carril 6 [5])
                this.p2.lane = 3 + ((this.p2.lane - 3 + 1) % 3);
            }

            this.p2.isHoldingRun = true;
        }

        _handleP2KeyUpH(now) {
            if (!this.p2.isAlive) return;
            this.p2.lastReleaseTime = now;
            this.p2.isHoldingRun = false;
        }

        _handleP2KeyDownL(now) {
            if (!this.p2.isAlive) return;
            this.p2.bActionTimer = 0.16;
            this._processPlayerHit(this.p2);
        }

        // ====================================================================
        // SISTEMA DE ACCIÓN / GOLPE B (F para P1, L para P2)
        // ====================================================================

        _processPlayerHit(player) {
            const range = MP_CONFIG.COMBAT.INTERACTION_RANGE;
            // Buscar obstáculos en el carril exacto del jugador dentro del alcance frontal
            const target = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED') return false;
                if (obs.lane !== player.lane) return false;
                const relZ = obs.z - player.z;
                return relZ >= -20 && relZ <= range;
            });

            if (!target) return;

            if (target.type === MP_CONFIG.OBSTACLES.TYPES.TOWER) {
                // Derrumbar la estructura hacia su carril de inclinación (siempre dentro de su zona)
                target.state = 'TOPPLING';
                target.toppleProgress = 0;
                target.lane = target.fallTargetLane;
                this._spawnParticles(target.visualX || 0, target.y || 0, '#ffbe0b', 16);
            } else if (target.type === MP_CONFIG.OBSTACLES.TYPES.BARRICADE) {
                // Romper barricada frágil
                target.state = 'SHATTERED';
                target.shatterProgress = 0;
                this._spawnParticles(target.visualX || 0, target.y || 0, '#cbd5e1', 20);
            } else if (target.type === MP_CONFIG.OBSTACLES.TYPES.MONOLITH) {
                // Monolito indestructible resiste el golpe
                target.hitFlash = 0.18;
                this._spawnParticles(target.visualX || 0, target.y || 0, '#ef4444', 8);
            }
        }

        // ====================================================================
        // GENERACIÓN DE OBSTÁCULOS AISLADOS (6 CARRILES)
        // ====================================================================

        _spawnObstaclesAhead(maxZ) {
            const step = MP_CONFIG.OBSTACLES.SPAWN_INTERVAL_METERS * 10;
            while (this.nextSpawnZ < maxZ + 1400) {
                const z = this.nextSpawnZ;

                // Generar obstáculo en lado P1 (Carriles 0, 1, 2)
                if (Math.random() < 0.68) {
                    const laneP1 = Math.floor(Math.random() * 3);
                    this._createObstacle(laneP1, z, MP_CONFIG.LANES.P1_LANES);
                }

                // Generar obstáculo en lado P2 (Carriles 3, 4, 5)
                if (Math.random() < 0.68) {
                    const laneP2 = 3 + Math.floor(Math.random() * 3);
                    this._createObstacle(laneP2, z, MP_CONFIG.LANES.P2_LANES);
                }

                this.nextSpawnZ += step;
            }
        }

        _createObstacle(lane, z, validLanes) {
            const typeRoll = Math.random();
            let type = MP_CONFIG.OBSTACLES.TYPES.BARRICADE;
            let fallTargetLane = null;
            let tiltDir = 1;

            if (typeRoll < 0.38) {
                // Estructura inestable / Torre inclinada
                type = MP_CONFIG.OBSTACLES.TYPES.TOWER;
                // Escoger carril adyacente dentro de la MISMA ZONA (nunca cruza la línea negra)
                const isLeftEdge = (lane === validLanes[0]);
                const isRightEdge = (lane === validLanes[validLanes.length - 1]);

                if (isLeftEdge) {
                    fallTargetLane = validLanes[1];
                    tiltDir = 1; // Cae a la derecha
                } else if (isRightEdge) {
                    fallTargetLane = validLanes[1];
                    tiltDir = -1; // Cae a la izquierda
                } else {
                    // Centro de la zona: puede caer a la izquierda o derecha de su sector
                    tiltDir = Math.random() < 0.5 ? -1 : 1;
                    fallTargetLane = (tiltDir === 1) ? validLanes[2] : validLanes[0];
                }
            } else if (typeRoll < 0.60) {
                // Monolito indestructible
                type = MP_CONFIG.OBSTACLES.TYPES.MONOLITH;
            }

            this.obstacles.push({
                id: this.nextObsId++,
                lane,
                z,
                type,
                fallTargetLane,
                tiltDir,
                state: 'ACTIVE',
                toppleProgress: 0,
                shatterProgress: 0,
                hitFlash: 0,
                spriteIdx: Math.floor(Math.random() * 8)
            });
        }

        // ====================================================================
        // PROYECCIÓN 2.5D CON LÍNEA CENTRAL NEGRA GRUESA (6 CARRILES)
        // ====================================================================

        /**
         * Proyecta coordenadas del mundo a pantalla.
         * En 6 carriles:
         *  - Dividir central negro = 0.0
         *  - Carril 1 (P1-IZQ)  = -2.5
         *  - Carril 2 (P1-CEN)  = -1.5
         *  - Carril 3 (P1-DER)  = -0.5
         *  - [LÍNEA NEGRA DIVISORIA SÓLIDA] = 0.0
         *  - Carril 4 (P2-IZQ)  = +0.5
         *  - Carril 5 (P2-CEN)  = +1.5
         *  - Carril 6 (P2-DER)  = +2.5
         */
        project(laneFloat, relZ) {
            const horizonY = this.height * 0.32;
            const playerScreenY = this.height * 0.86;
            const maxZ = MP_CONFIG.VISUALS.HORIZON_Z;

            const clampedZ = Math.max(-130, relZ);
            const normZ = Math.min(1, Math.max(-0.10, clampedZ / maxZ));
            const perspective = 1 / (1 + normZ * 4.6);

            const y = horizonY + (playerScreenY - horizonY) * perspective;
            const trackWidthAtPlayer = Math.min(this.width * 0.94, MP_CONFIG.VISUALS.TRACK_MAX_WIDTH);
            const currentTrackWidth = trackWidthAtPlayer * perspective;
            const laneWidth = currentTrackWidth / 6;

            // Convertir carril 0..5 a posición centrada respecto a la línea central
            const centeredOffset = (laneFloat - 2.5) * laneWidth;
            const centerX = this.width * 0.5;
            const x = centerX + centeredOffset;

            return {
                x,
                y,
                scale: perspective,
                laneWidth,
                centerX,
                currentTrackWidth
            };
        }

        // ====================================================================
        // BUCLE PRINCIPAL DE ACTUALIZACIÓN (UPDATE)
        // ====================================================================

        start() {
            this.running = true;
            this.lastFrameTime = performance.now();
            requestAnimationFrame((t) => this._loop(t));
        }

        _loop(now) {
            if (!this.running) return;

            const dt = Math.min((now - this.lastFrameTime) / 1000, 0.06);
            this.lastFrameTime = now;

            this._update(dt, now);
            this._render(now);

            requestAnimationFrame((t) => this._loop(t));
        }

        _update(dt, now) {
            // Actualizar ambos jugadores de forma independiente
            this._updatePlayer(this.p1, dt);
            this._updatePlayer(this.p2, dt);

            // La distancia general de la carrera avanza con el corredor líder o promedio
            const leaderZ = Math.max(this.p1.z, this.p2.z);
            this.totalDistanceMeters = Math.floor(leaderZ / 10);

            // Generar nuevos obstáculos por delante
            this._spawnObstaclesAhead(leaderZ);

            // Actualizar físicas de obstáculos (derrumbe, desvanecimiento)
            this._updateObstacles(dt);

            // Actualizar partículas
            this._updateParticles(dt);

            // Chequeo de colisiones y vidas (TAREA 3)
            this._checkPlayerCollisions(this.p1);
            this._checkPlayerCollisions(this.p2);

            // Actualizar HUD de ambos jugadores
            this._updateHUD();

            // Verificar condición de fin de partida
            if (!this.isMatchOver && (!this.p1.isAlive && !this.p2.isAlive)) {
                this._finishMatch();
            }
        }

        _updatePlayer(player, dt) {
            if (!player.isAlive) {
                player.speed = Math.max(0, player.speed - MP_CONFIG.MOVEMENT.DECELERATION * dt);
                return;
            }

            // Aceleración suave y continua al mantener la tecla
            if (player.isHoldingRun) {
                player.speed = Math.min(MP_CONFIG.MOVEMENT.MAX_SPEED, player.speed + MP_CONFIG.MOVEMENT.ACCELERATION * dt);
            } else {
                player.speed = Math.max(0, player.speed - MP_CONFIG.MOVEMENT.DECELERATION * dt);
            }

            player.z += player.speed * dt;

            // Suavizado lerp del movimiento horizontal entre carriles
            const laneDiff = player.lane - player.visualLane;
            player.visualLane += laneDiff * Math.min(1, MP_CONFIG.LANES.LERP_SPEED * dt);

            // Ciclo de pasos / animaciones
            if (player.speed > 20) {
                player.stridePhase += dt * (player.speed * 0.016);
            }

            // Temporizadores de golpe e invulnerabilidad
            if (player.bActionTimer > 0) player.bActionTimer -= dt;
            if (player.invulnerableTimer > 0) player.invulnerableTimer -= dt;

            // Margen de persecución: si se detiene, la barra se agota
            if (player.isHoldingRun) {
                player.pursuitDistance = Math.min(1000, player.pursuitDistance + 450 * dt);
            } else {
                player.pursuitDistance = Math.max(0, player.pursuitDistance - 380 * dt);
            }

            // BPM progresivo con la velocidad
            const targetBpm = 110 + Math.floor((player.speed / MP_CONFIG.MOVEMENT.MAX_SPEED) * 70);
            player.bpm = Math.round(player.bpm + (targetBpm - player.bpm) * Math.min(1, dt * 2));
        }

        _updateObstacles(dt) {
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];

                if (obs.hitFlash > 0) obs.hitFlash -= dt;

                if (obs.state === 'TOPPLING') {
                    obs.toppleProgress = Math.min(1.0, obs.toppleProgress + dt * 4.2);
                    if (obs.toppleProgress >= 1.0) {
                        obs.state = 'COLLAPSED';
                    }
                } else if (obs.state === 'SHATTERED') {
                    obs.shatterProgress = Math.min(1.0, obs.shatterProgress + dt * 3.5);
                }

                // Despawn de obstáculos que quedaron muy atrás de ambos jugadores
                const minZ = Math.min(this.p1.z, this.p2.z);
                if (obs.z < minZ - 300) {
                    this.obstacles.splice(i, 1);
                }
            }
        }

        // ====================================================================
        // TAREA 3: SISTEMA DE 3 VIDAS Y COLISIONES AISLADAS
        // ====================================================================

        _checkPlayerCollisions(player) {
            if (!player.isAlive || player.invulnerableTimer > 0) return;

            const hitboxDepth = 36;
            for (const obs of this.obstacles) {
                if (obs.state === 'SHATTERED') continue;

                // Debe estar exactamente en el carril donde se encuentra el obstáculo
                const inSameLane = Math.abs(player.visualLane - obs.lane) < 0.45;
                const relZ = obs.z - player.z;
                const inCollisionZ = (relZ >= -hitboxDepth && relZ <= hitboxDepth);

                if (inSameLane && inCollisionZ) {
                    // Colisión frontal directa: pierde 1 vida
                    player.lives--;
                    player.invulnerableTimer = MP_CONFIG.COMBAT.INVULNERABLE_DURATION;

                    // Efectos de impacto
                    obs.state = 'SHATTERED';
                    this._spawnParticles(obs.visualX || 0, obs.y || 0, '#ff1e38', 24);

                    // Si llega a 0 vidas: ELIMINACIÓN INDIVIDUAL
                    if (player.lives <= 0) {
                        player.lives = 0;
                        player.isAlive = false;
                        this._showEliminationAlert(player);
                    }
                    break;
                }
            }
        }

        _showEliminationAlert(player) {
            if (player.id === 1 && this.dom.p1Banner) {
                this.dom.p1Banner.classList.remove('hidden');
                this.dom.p1Banner.textContent = '💀 JUGADOR 1 ELIMINADO';
            } else if (player.id === 2 && this.dom.p2Banner) {
                this.dom.p2Banner.classList.remove('hidden');
                this.dom.p2Banner.textContent = '💀 JUGADOR 2 ELIMINADO';
            }
        }

        _finishMatch() {
            this.isMatchOver = true;

            let winnerText = '¡EMPATE TÉCNICO!';
            let winnerColor = '#ffffff';

            if (this.p1.z > this.p2.z) {
                winnerText = '¡VICTORIA DEL JUGADOR 1!';
                winnerColor = '#2ec4b6';
            } else if (this.p2.z > this.p1.z) {
                winnerText = '¡VICTORIA DEL JUGADOR 2!';
                winnerColor = '#ff9f1c';
            }

            if (this.dom.winnerAnnouncement) {
                this.dom.winnerAnnouncement.textContent = winnerText;
                this.dom.winnerAnnouncement.style.color = winnerColor;
            }

            if (this.dom.statsSummary) {
                const km = (this.totalDistanceMeters / 1000).toFixed(2);
                this.dom.statsSummary.innerHTML = `
                    DISTANCIA TOTAL: <strong style="color:#ffffff;">${km} km</strong> (${this.totalDistanceMeters} m)<br/>
                    P1: ${(this.p1.z / 10).toFixed(0)}m (${this.p1.lives} vidas) &nbsp;|&nbsp; 
                    P2: ${(this.p2.z / 10).toFixed(0)}m (${this.p2.lives} vidas)
                `;
            }

            if (this.dom.gameoverOverlay) {
                this.dom.gameoverOverlay.classList.remove('hidden');
            }
        }

        restartMatch() {
            this.p1.lane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.visualLane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.speed = 0;
            this.p1.z = 0;
            this.p1.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p1.isAlive = true;
            this.p1.isHoldingRun = false;
            this.p1.lastReleaseTime = 0;
            this.p1.invulnerableTimer = 0;

            this.p2.lane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.visualLane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.speed = 0;
            this.p2.z = 0;
            this.p2.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p2.isAlive = true;
            this.p2.isHoldingRun = false;
            this.p2.lastReleaseTime = 0;
            this.p2.invulnerableTimer = 0;

            this.obstacles = [];
            this.particles = [];
            this.nextObsId = 1;
            this.nextSpawnZ = 450;
            this.totalDistanceMeters = 0;
            this.isMatchOver = false;

            if (this.dom.p1Banner) this.dom.p1Banner.classList.add('hidden');
            if (this.dom.p2Banner) this.dom.p2Banner.classList.add('hidden');
            if (this.dom.gameoverOverlay) this.dom.gameoverOverlay.classList.add('hidden');
        }

        _updateHUD() {
            // Actualizar corazones P1
            if (this.dom.p1Lives) {
                let heartsHtml = '';
                for (let i = 0; i < 3; i++) {
                    heartsHtml += (i < this.p1.lives)
                        ? '<span class="heart-full">♥</span>'
                        : '<span class="heart-empty">♥</span>';
                }
                this.dom.p1Lives.innerHTML = heartsHtml;
            }

            // Actualizar corazones P2
            if (this.dom.p2Lives) {
                let heartsHtml = '';
                for (let i = 0; i < 3; i++) {
                    heartsHtml += (i < this.p2.lives)
                        ? '<span class="heart-full">♥</span>'
                        : '<span class="heart-empty">♥</span>';
                }
                this.dom.p2Lives.innerHTML = heartsHtml;
            }

            // BPM y Barras de persecución
            if (this.dom.p1Bpm) this.dom.p1Bpm.textContent = `${this.p1.bpm} BPM`;
            if (this.dom.p2Bpm) this.dom.p2Bpm.textContent = `${this.p2.bpm} BPM`;

            if (this.dom.p1PursuitBar) {
                this.dom.p1PursuitBar.style.width = `${Math.round((this.p1.pursuitDistance / 1000) * 100)}%`;
            }
            if (this.dom.p2PursuitBar) {
                this.dom.p2PursuitBar.style.width = `${Math.round((this.p2.pursuitDistance / 1000) * 100)}%`;
            }

            if (this.dom.distanceText) {
                const km = (this.totalDistanceMeters / 1000).toFixed(2);
                this.dom.distanceText.textContent = `${km} km`;
            }
        }

        // ====================================================================
        // RENDERIZADO VISUAL OPgender (CANVAS)
        // ====================================================================

        _render(now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            // 1. Cielo opresivo y sol negro en el horizonte
            this._drawAtmosphere(ctx, now);

            // 2. Pista de 6 Carriles con asfalto fracturado
            this._drawTrackAndLanes(ctx, now);

            // 3. TAREA 2: Línea Central Divisoria Negra Sólida y Gruesa
            this._drawSolidBlackCentralDivider(ctx);

            // 4. Obstáculos proyectados y ordenados por profundidad Z
            this._drawObstacles(ctx, now);

            // 5. Corredores (Jugador 1 y Jugador 2)
            this._drawPlayerSprite(ctx, this.p1, now);
            this._drawPlayerSprite(ctx, this.p2, now);

            // 6. Partículas de impacto
            this._drawParticles(ctx);
        }

        _drawAtmosphere(ctx, now) {
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#040406');
            grad.addColorStop(0.32, '#0c0a12');
            grad.addColorStop(1, '#050507');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);

            // Grieta espectral en el centro del horizonte
            const horizonY = this.height * 0.32;
            const pulse = Math.sin(now * 0.003) * 8;
            const rad = ctx.createRadialGradient(
                this.width * 0.5, horizonY, 8,
                this.width * 0.5, horizonY, 220 + pulse
            );
            rad.addColorStop(0, 'rgba(180, 20, 40, 0.28)');
            rad.addColorStop(0.6, 'rgba(40, 10, 20, 0.08)');
            rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, this.width, this.height * 0.55);
        }

        _drawTrackAndLanes(ctx, now) {
            const camZ = Math.min(this.p1.z, this.p2.z);
            const nearP = this.project(2.5, -120);
            const farP = this.project(2.5, MP_CONFIG.VISUALS.HORIZON_Z);

            // Asfalto general de los 6 carriles
            ctx.fillStyle = '#0a0a0f';
            ctx.beginPath();
            ctx.moveTo(farP.centerX - farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(farP.centerX + farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX + nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.lineTo(nearP.centerX - nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.closePath();
            ctx.fill();

            // Líneas de velocidad horizontales
            const stepZ = 90;
            const offsetZ = stepZ - (camZ % stepZ) - stepZ * 2;
            for (let z = offsetZ; z < MP_CONFIG.VISUALS.HORIZON_Z; z += stepZ) {
                if (z < -120) continue;
                const p = this.project(2.5, z);
                ctx.strokeStyle = `rgba(130, 130, 155, ${Math.min(0.25, p.scale * 0.35)})`;
                ctx.lineWidth = Math.max(1, 2 * p.scale);
                ctx.beginPath();
                ctx.moveTo(p.centerX - p.currentTrackWidth * 0.5, p.y);
                ctx.lineTo(p.centerX + p.currentTrackWidth * 0.5, p.y);
                ctx.stroke();
            }

            // Líneas divisorias de carriles (excepto el centro X=0 que es la línea negra)
            // Bordes externos y divisores internos
            const dividers = [-3.0, -2.0, -1.0, 1.0, 2.0, 3.0];
            for (const div of dividers) {
                const isOuter = (div === -3.0 || div === 3.0);
                ctx.strokeStyle = isOuter ? 'rgba(210, 35, 55, 0.65)' : 'rgba(160, 165, 185, 0.16)';
                ctx.lineWidth = isOuter ? 2.5 : 1.2;

                ctx.beginPath();
                for (let z = -120; z <= MP_CONFIG.VISUALS.HORIZON_Z; z += 90) {
                    const p = this.project(2.5 + div, z);
                    if (z === -120) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
        }

        // ====================================================================
        // TAREA 2: LÍNEA CENTRAL DIVISORIA NEGRA SÓLIDA Y GRUESA
        // ====================================================================

        _drawSolidBlackCentralDivider(ctx) {
            // Se dibuja exactamente en medio de ambos bloques (entre Carril 3 y Carril 4 -> X=0)
            ctx.save();

            // Sombra / zanja negra profunda bajo la barrera
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 14;
            ctx.beginPath();
            for (let z = -120; z <= MP_CONFIG.VISUALS.HORIZON_Z; z += 80) {
                const p = this.project(2.5 + 0.0, z); // Posición 0.0 = Centro exacto entre P1 y P2
                if (z === -120) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // Muro / Cordón negro sólido en relieve 3D
            for (let z = MP_CONFIG.VISUALS.HORIZON_Z; z >= -120; z -= 70) {
                const pNear = this.project(2.5 + 0.0, z);
                const pFar = this.project(2.5 + 0.0, z + 70);

                const barrierH = 26 * pNear.scale;
                const barrierW = Math.max(6, 14 * pNear.scale);

                // Bloque negro sólido
                ctx.fillStyle = '#050507';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;

                ctx.beginPath();
                ctx.moveTo(pNear.x - barrierW * 0.5, pNear.y);
                ctx.lineTo(pNear.x + barrierW * 0.5, pNear.y);
                ctx.lineTo(pFar.x + barrierW * 0.5, pFar.y);
                ctx.lineTo(pFar.x - barrierW * 0.5, pFar.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Lomo superior de la barrera divisoria
                ctx.fillStyle = '#0f0f14';
                ctx.beginPath();
                ctx.moveTo(pNear.x - barrierW * 0.5, pNear.y - barrierH);
                ctx.lineTo(pNear.x + barrierW * 0.5, pNear.y - barrierH);
                ctx.lineTo(pFar.x + barrierW * 0.5, pFar.y - barrierH);
                ctx.lineTo(pFar.x - barrierW * 0.5, pFar.y - barrierH);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }

        // ====================================================================
        // RENDERIZADO DE OBSTÁCULOS
        // ====================================================================

        _drawObstacles(ctx, now) {
            const camZ = Math.min(this.p1.z, this.p2.z);

            // Ordenar obstáculos del más lejano al más cercano
            const sorted = [...this.obstacles].sort((a, b) => b.z - a.z);

            for (const obs of sorted) {
                const relZ = obs.z - camZ;
                if (relZ < -100 || relZ > MP_CONFIG.VISUALS.HORIZON_Z) continue;

                const p = this.project(obs.lane, relZ);
                obs.visualX = p.x;
                obs.y = p.y;

                if (obs.type === MP_CONFIG.OBSTACLES.TYPES.TOWER) {
                    this._drawTowerObstacle(ctx, obs, p);
                } else if (obs.type === MP_CONFIG.OBSTACLES.TYPES.MONOLITH) {
                    this._drawMonolithObstacle(ctx, obs, p);
                } else {
                    this._drawBarricadeObstacle(ctx, obs, p);
                }
            }
        }

        _drawTowerObstacle(ctx, obs, p) {
            ctx.save();
            ctx.translate(p.x, p.y);

            let angle = 0;
            if (obs.state === 'TOPPLING') {
                angle = obs.tiltDir * obs.toppleProgress * 1.25;
            } else if (obs.state === 'COLLAPSED') {
                angle = obs.tiltDir * 1.30;
            }
            ctx.rotate(angle);

            // Escoger imagen según dirección de inclinación
            const imgList = obs.tiltDir > 0 ? this.sprites.rightTowers : this.sprites.leftTowers;
            const chosenPath = imgList[obs.spriteIdx % imgList.length];
            const img = this.loadedImages[chosenPath];

            const spriteH = 220 * p.scale;
            const spriteW = spriteH * 0.72;
            const drawX = -spriteW * 0.5;
            const drawY = -spriteH;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, drawX, drawY, spriteW, spriteH);
            } else {
                // Fallback procedural retro
                ctx.fillStyle = '#ffbe0b';
                ctx.fillRect(drawX, drawY, spriteW, spriteH);
            }

            ctx.restore();
        }

        _drawMonolithObstacle(ctx, obs, p) {
            const h = 150 * p.scale;
            const w = p.laneWidth * 0.90;

            ctx.save();
            ctx.fillStyle = (obs.hitFlash > 0) ? '#551a24' : '#08080c';
            ctx.strokeStyle = (obs.hitFlash > 0) ? '#ffffff' : '#d90429';
            ctx.lineWidth = Math.max(1.5, 3.0 * p.scale);

            ctx.fillRect(p.x - w * 0.5, p.y - h, w, h);
            ctx.strokeRect(p.x - w * 0.5, p.y - h, w, h);

            if (p.scale > 0.28) {
                ctx.fillStyle = '#d90429';
                ctx.font = `bold ${Math.max(10, Math.floor(20 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('███', p.x, p.y - h * 0.5);
            }
            ctx.restore();
        }

        _drawBarricadeObstacle(ctx, obs, p) {
            if (obs.state === 'SHATTERED' && obs.shatterProgress >= 1.0) return;

            const isDestroyed = (obs.state === 'SHATTERED');
            const imgPath = isDestroyed
                ? this.sprites.barricadeDestroyed[obs.spriteIdx % this.sprites.barricadeDestroyed.length]
                : this.sprites.barricades[obs.spriteIdx % this.sprites.barricades.length];
            const img = this.loadedImages[imgPath];

            const spriteW = p.laneWidth * 1.15;
            const spriteH = spriteW * 0.56;
            const drawX = p.x - spriteW * 0.5;
            const drawY = p.y - spriteH * 0.88;

            ctx.save();
            if (isDestroyed) {
                ctx.globalAlpha = Math.max(0, 1.0 - obs.shatterProgress);
            }

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, drawX, drawY, spriteW, spriteH);
            } else {
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(drawX, drawY, spriteW, spriteH);
            }
            ctx.restore();
        }

        // ====================================================================
        // RENDERIZADO DE JUGADORES (CORREDORES P1 Y P2)
        // ====================================================================

        _drawPlayerSprite(ctx, player, now) {
            if (!player.isAlive && player.speed <= 5) return;

            // Parpadeo durante la invulnerabilidad tras recibir golpe
            if (player.invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0) {
                return;
            }

            const camZ = Math.min(this.p1.z, this.p2.z);
            const p = this.project(player.visualLane, player.z - camZ);

            const speedRatio = player.speed / MP_CONFIG.MOVEMENT.MAX_SPEED;
            const bobY = Math.abs(Math.sin(player.stridePhase)) * 10 * speedRatio;
            const tiltX = (player.lane - player.visualLane) * 0.28;

            ctx.save();
            ctx.translate(p.x, p.y - bobY);
            ctx.rotate(tiltX);

            // Sombra en el carril
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.beginPath();
            ctx.ellipse(0, bobY, 26, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Onda de choque al golpear
            if (player.bActionTimer > 0) {
                ctx.strokeStyle = player.color;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(0, -35, 45, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }

            const bodyH = 74;
            const bodyW = 30;

            // Silueta oscura con aura de su color respectivo (Cyan P1 / Ámbar P2)
            ctx.strokeStyle = player.isHoldingRun ? '#ffffff' : player.color;
            ctx.fillStyle = '#0b0c10';
            ctx.lineWidth = 2.4;

            // Torso
            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.5, 0);
            ctx.lineTo(-bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Cabeza
            ctx.beginPath();
            ctx.arc(0, -bodyH * 0.88, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Identificador visual en la espalda (P1 o P2)
            ctx.fillStyle = player.color;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(player.id === 1 ? 'P1' : 'P2', 0, -bodyH * 0.38);

            ctx.restore();
        }

        // ====================================================================
        // SISTEMA DE PARTÍCULAS
        // ====================================================================

        _spawnParticles(x, y, color, count) {
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 360,
                    vy: -Math.random() * 280 - 60,
                    size: Math.random() * 4 + 2,
                    color,
                    life: 0.65,
                    maxLife: 0.65
                });
            }
        }

        _updateParticles(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const pt = this.particles[i];
                pt.x += pt.vx * dt;
                pt.y += pt.vy * dt;
                pt.vy += 650 * dt; // Gravedad
                pt.life -= dt;
                if (pt.life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }

        _drawParticles(ctx) {
            for (const pt of this.particles) {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.fillStyle = pt.color;
                ctx.globalAlpha = alpha;
                ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
            }
            ctx.globalAlpha = 1.0;
        }
    }

    // Inicialización automática cuando el DOM esté listo
    window.addEventListener('DOMContentLoaded', () => {
        const game = new MultiplayerGame();
        game.start();
        window.MP_GAME = game;
    });

})();
