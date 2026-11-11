/**
 * ============================================================================
 * PSYCHOLOGICAL SURVIVAL RUNNER — MULTIJUGADOR LOCAL (6 CARRILES / P1 vs P2)
 * ============================================================================
 * Módulo 100% independiente y desacoplado del juego individual.
 *
 * Características:
 *  - Doble Monitor Médico CONTEC con ECG animado en tiempo real para P1 y P2.
 *  - Carrera continua a velocidad constante (inicia suave y acelera a velocidad de crucero).
 *  - P2 con MODO AUTOMÁTICO (BOT) por defecto para pruebas individuales,
 *    conmutable a CONTROL MANUAL mediante botón visible en pantalla.
 *  - Controles cero-delay de micro-soltado (< 0.25s) y golpe:
 *      * P1: [A] (micro-soltado cambia carril) / [F] (golpe)
 *      * P2: [H] (micro-soltado cambia carril) / [L] (golpe)
 *  - 6 Carriles con Línea Central Divisoria Negra Sólida (Barrera física infranqueable).
 *  - Sistema independiente de 3 vidas con eliminación individual.
 */

(function () {
    'use strict';

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
            LERP_SPEED: 22.0
        },
        SPEED: {
            INITIAL: 320,
            MAX: 740,
            ACCEL_RATE: 140 // Aceleración suave hasta velocidad constante
        },
        COMBAT: {
            INITIAL_LIVES: 3,
            INVULNERABLE_DURATION: 1.3,
            INTERACTION_RANGE: 220
        },
        CONTROLS: {
            MICRO_RELEASE_MAX_MS: 250 // < 0.25s para cambio instantáneo de carril
        },
        VISUALS: {
            HORIZON_Z: 2800,
            TRACK_MAX_WIDTH: 1160
        }
    };

    class MultiplayerApp {
        constructor() {
            this.canvas = document.getElementById('multiplayer-canvas');
            this.ctx = this.canvas.getContext('2d');

            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            // Estado de la velocidad constante compartida de la carrera
            this.currentSpeed = MP_CONFIG.SPEED.INITIAL;
            this.worldZ = 0;
            this.distanceMeters = 0;
            this.isMatchOver = false;

            // Estado Jugador 1
            this.p1 = {
                id: 1,
                name: 'JUGADOR 1',
                lane: MP_CONFIG.LANES.P1_DEFAULT,
                visualLane: MP_CONFIG.LANES.P1_DEFAULT,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isHoldingKey: true, // Corre de forma continua
                lastReleaseTime: 0,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                heartPulsePhase: 0,
                stridePhase: 0,
                pursuitDistance: 1000,
                color: '#2ec4b6'
            };

            // Estado Jugador 2 (Con Modo Bot Automático por defecto)
            this.p2 = {
                id: 2,
                name: 'JUGADOR 2',
                lane: MP_CONFIG.LANES.P2_DEFAULT,
                visualLane: MP_CONFIG.LANES.P2_DEFAULT,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isHoldingKey: true,
                isBot: true, // Por defecto se mueve automático para pruebas
                botCooldown: 0,
                lastReleaseTime: 0,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                heartPulsePhase: 0,
                stridePhase: 0,
                pursuitDistance: 1000,
                color: '#ff9f1c'
            };

            this.obstacles = [];
            this.particles = [];
            this.nextObsId = 1;
            this.nextSpawnZ = 480;

            this.asciiBackgroundNodes = this._generateAsciiBuildings();

            // Referencias a los lienzos ECG osciloscopio
            this.p1EcgCanvas = document.getElementById('p1-ecg-canvas');
            this.p1EcgCtx = this.p1EcgCanvas ? this.p1EcgCanvas.getContext('2d') : null;

            this.p2EcgCanvas = document.getElementById('p2-ecg-canvas');
            this.p2EcgCtx = this.p2EcgCanvas ? this.p2EcgCanvas.getContext('2d') : null;

            this.dom = {
                p1Lives: document.getElementById('p1-lives-display'),
                p2Lives: document.getElementById('p2-lives-display'),
                p1Bpm: document.getElementById('p1-bpm-val'),
                p2Bpm: document.getElementById('p2-bpm-val'),
                p1Lane: document.getElementById('p1-lane-val'),
                p2Lane: document.getElementById('p2-lane-val'),
                p1ProgressLbl: document.getElementById('p1-progress-lbl'),
                p2ProgressLbl: document.getElementById('p2-progress-lbl'),
                p1ProgressFill: document.getElementById('p1-progress-fill'),
                p2ProgressFill: document.getElementById('p2-progress-fill'),
                p1PursuitFill: document.getElementById('p1-pursuit-fill'),
                p2PursuitFill: document.getElementById('p2-pursuit-fill'),
                odometer: document.getElementById('mp-odometer'),
                btnToggleP2: document.getElementById('btn-toggle-p2-control'),
                p1ElimTag: document.getElementById('p1-elimination-tag'),
                p2ElimTag: document.getElementById('p2-elimination-tag'),
                resultsOverlay: document.getElementById('mp-results-overlay'),
                resultWinner: document.getElementById('mp-result-winner'),
                resultDetails: document.getElementById('mp-result-details'),
                btnRematch: document.getElementById('btn-rematch')
            };

            this._loadSprites();
            this._setupResize();
            this._bindControls();
            this._bindUI();
        }

        _loadSprites() {
            this.spriteImages = {
                rightTowers: ['img/obstacle_yellow_right.png', 'img/obstacle_yellow_right_2.png'],
                leftTowers: [
                    'img/obstacle_yellow_left.png',
                    'img/obstacle_yellow_left_2.png',
                    'img/obstacle_yellow_left_3.png',
                    'img/obstacle_yellow_left_4.png'
                ],
                barricades: ['img/barricade_intact.png', 'img/05.png'],
                barricadesDestroyed: ['img/barricade_destroyed.png', 'img/06.png'],
                heart: 'img/corazon.png'
            };

            this.images = {};
            const list = [
                ...this.spriteImages.rightTowers,
                ...this.spriteImages.leftTowers,
                ...this.spriteImages.barricades,
                ...this.spriteImages.barricadesDestroyed,
                this.spriteImages.heart
            ];

            list.forEach(p => {
                const img = new Image();
                img.src = p;
                this.images[p] = img;
            });
        }

        _generateAsciiBuildings() {
            const glyphs = ['▓', '█', '▒', '░', '╪', '╬', '║', '¥', '§'];
            const nodes = [];
            for (let z = 0; z < MP_CONFIG.VISUALS.HORIZON_Z; z += 90) {
                nodes.push({
                    z,
                    side: -1,
                    glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                    heightFactor: 0.6 + Math.random() * 0.9,
                    offsetFactor: 1.25 + Math.random() * 0.35
                });
                nodes.push({
                    z,
                    side: 1,
                    glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                    heightFactor: 0.6 + Math.random() * 0.9,
                    offsetFactor: 1.25 + Math.random() * 0.35
                });
            }
            return nodes;
        }

        _setupResize() {
            const handleResize = () => {
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                this.canvas.width = this.width * this.dpr;
                this.canvas.height = this.height * this.dpr;
                this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            };
            window.addEventListener('resize', handleResize);
            handleResize();
        }

        _bindControls() {
            window.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                const now = performance.now();

                // === JUGADOR 1: TECLAS [A] Y [F] ===
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    this._onP1KeyDownA(now);
                } else if (e.code === 'KeyF') {
                    e.preventDefault();
                    this._onP1KeyDownF();
                }

                // === JUGADOR 2: TECLAS [H] Y [L] ===
                else if (e.code === 'KeyH') {
                    e.preventDefault();
                    if (!this.p2.isBot) {
                        this._onP2KeyDownH(now);
                    }
                } else if (e.code === 'KeyL') {
                    e.preventDefault();
                    if (!this.p2.isBot) {
                        this._onP2KeyDownL();
                    }
                }

                // Reinicio global
                else if (e.code === 'KeyR') {
                    if (this.isMatchOver) {
                        this.rematch();
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                const now = performance.now();
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    this._onP1KeyUpA(now);
                } else if (e.code === 'KeyH') {
                    e.preventDefault();
                    if (!this.p2.isBot) {
                        this._onP2KeyUpH(now);
                    }
                }
            });
        }

        _bindUI() {
            if (this.dom.btnToggleP2) {
                this.dom.btnToggleP2.addEventListener('click', () => {
                    this.p2.isBot = !this.p2.isBot;
                    this._updateP2BotButtonUI();
                });
            }

            if (this.dom.btnRematch) {
                this.dom.btnRematch.addEventListener('click', () => {
                    this.rematch();
                });
            }
        }

        _updateP2BotButtonUI() {
            if (!this.dom.btnToggleP2) return;
            if (this.p2.isBot) {
                this.dom.btnToggleP2.classList.remove('manual-active');
                this.dom.btnToggleP2.textContent = '🤖 P2: MODO AUTOMÁTICO (CLIC PARA USAR P2)';
            } else {
                this.dom.btnToggleP2.classList.add('manual-active');
                this.dom.btnToggleP2.textContent = '🎮 P2: CONTROL MANUAL ACTIVO [H / L]';
            }
        }

        // ====================================================================
        // CONTROLES DE CERO DELAY (Micro-soltado < 0.25s)
        // ====================================================================

        _onP1KeyDownA(now) {
            if (!this.p1.isAlive) return;

            const timeSinceRelease = now - this.p1.lastReleaseTime;
            // Si fue soltada por un instante menor a 0.25s (micro-soltado):
            if (this.p1.lastReleaseTime > 0 && timeSinceRelease <= MP_CONFIG.CONTROLS.MICRO_RELEASE_MAX_MS) {
                // Cambio instantáneo de carril (ciclo 0 -> 1 -> 2 -> 0)
                this.p1.lane = (this.p1.lane + 1) % 3;
            }
            this.p1.isHoldingKey = true;
        }

        _onP1KeyUpA(now) {
            if (!this.p1.isAlive) return;
            this.p1.lastReleaseTime = now;
            this.p1.isHoldingKey = false;
        }

        _onP1KeyDownF() {
            if (!this.p1.isAlive) return;
            this.p1.bActionTimer = 0.16;
            this._executeStrike(this.p1);
        }

        _onP2KeyDownH(now) {
            if (!this.p2.isAlive) return;

            const timeSinceRelease = now - this.p2.lastReleaseTime;
            if (this.p2.lastReleaseTime > 0 && timeSinceRelease <= MP_CONFIG.CONTROLS.MICRO_RELEASE_MAX_MS) {
                // Cambio instantáneo de carril en zona P2 (ciclo 3 -> 4 -> 5 -> 3)
                this.p2.lane = 3 + ((this.p2.lane - 3 + 1) % 3);
            }
            this.p2.isHoldingKey = true;
        }

        _onP2KeyUpH(now) {
            if (!this.p2.isAlive) return;
            this.p2.lastReleaseTime = now;
            this.p2.isHoldingKey = false;
        }

        _onP2KeyDownL() {
            if (!this.p2.isAlive) return;
            this.p2.bActionTimer = 0.16;
            this._executeStrike(this.p2);
        }

        _executeStrike(player) {
            const range = MP_CONFIG.COMBAT.INTERACTION_RANGE;
            const target = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED') return false;
                if (obs.lane !== player.lane) return false;
                const relZ = obs.z - this.worldZ;
                return relZ >= -20 && relZ <= range;
            });

            if (!target) return;

            if (target.type === 'TOWER') {
                target.state = 'TOPPLING';
                target.toppleProgress = 0;
                target.lane = target.fallTargetLane;
                this._spawnParticles(target.screenX || 0, target.screenY || 0, '#ffbe0b', 16);
            } else if (target.type === 'BARRICADE') {
                target.state = 'SHATTERED';
                target.shatterProgress = 0;
                this._spawnParticles(target.screenX || 0, target.screenY || 0, '#cbd5e1', 18);
            } else if (target.type === 'MONOLITH') {
                target.flashTimer = 0.16;
                this._spawnParticles(target.screenX || 0, target.screenY || 0, '#ef4444', 8);
            }
        }

        // ====================================================================
        // IA DEL BOT (P2 AUTOMÁTICO EN MODO PRUEBA)
        // ====================================================================

        _updateP2Bot(dt) {
            if (!this.p2.isBot || !this.p2.isAlive) return;

            if (this.p2.botCooldown > 0) {
                this.p2.botCooldown -= dt;
            }

            // Buscar obstáculo frontal próximo en el carril actual de P2
            const approachingObs = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED') return false;
                if (obs.lane !== this.p2.lane) return false;
                const relZ = obs.z - this.worldZ;
                return relZ >= 30 && relZ <= 240;
            });

            if (approachingObs) {
                const relZ = approachingObs.z - this.worldZ;

                if (approachingObs.type === 'MONOLITH') {
                    // Indestructible: esquivar a otro carril dentro de [3, 4, 5]
                    if (this.p2.botCooldown <= 0) {
                        const nextLane = this.p2.lane === 4 ? (Math.random() < 0.5 ? 3 : 5) : 4;
                        this.p2.lane = nextLane;
                        this.p2.botCooldown = 0.5;
                    }
                } else if (relZ <= 170) {
                    // Romper o derrumbar con golpe automático
                    this.p2.bActionTimer = 0.16;
                    this._executeStrike(this.p2);
                }
            }
        }

        // ====================================================================
        // PROYECCIÓN 2.5D (6 CARRILES CON DIVISIÓN CENTRAL NEGRA)
        // ====================================================================

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

            // Centro exacto = 2.5 (entre Carril 3 y Carril 4)
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
        // GENERACIÓN DE OBSTÁCULOS AISLADOS (6 CARRILES)
        // ====================================================================

        _spawnObstacles() {
            const step = 280;
            while (this.nextSpawnZ < this.worldZ + 1400) {
                const z = this.nextSpawnZ;

                // Lado P1 (Carriles 0, 1, 2)
                if (Math.random() < 0.70) {
                    const lP1 = Math.floor(Math.random() * 3);
                    this._createObstacle(lP1, z, MP_CONFIG.LANES.P1_LANES);
                }

                // Lado P2 (Carriles 3, 4, 5)
                if (Math.random() < 0.70) {
                    const lP2 = 3 + Math.floor(Math.random() * 3);
                    this._createObstacle(lP2, z, MP_CONFIG.LANES.P2_LANES);
                }

                this.nextSpawnZ += step;
            }
        }

        _createObstacle(lane, z, validLanes) {
            const r = Math.random();
            let type = 'BARRICADE';
            let fallTarget = null;
            let tiltDir = 1;

            if (r < 0.40) {
                type = 'TOWER';
                if (lane === validLanes[0]) {
                    fallTarget = validLanes[1];
                    tiltDir = 1; // Inclinado a la derecha
                } else if (lane === validLanes[2]) {
                    fallTarget = validLanes[1];
                    tiltDir = -1; // Inclinado a la izquierda
                } else {
                    tiltDir = Math.random() < 0.5 ? -1 : 1;
                    fallTarget = (tiltDir === 1) ? validLanes[2] : validLanes[0];
                }
            } else if (r < 0.62) {
                type = 'MONOLITH';
            }

            this.obstacles.push({
                id: this.nextObsId++,
                lane,
                z,
                type,
                fallTargetLane: fallTarget,
                tiltDir,
                state: 'ACTIVE',
                toppleProgress: 0,
                shatterProgress: 0,
                flashTimer: 0,
                spriteIdx: Math.floor(Math.random() * 6)
            });
        }

        // ====================================================================
        // BUCLE PRINCIPAL
        // ====================================================================

        start() {
            this.lastFrameTime = performance.now();
            requestAnimationFrame((t) => this._loop(t));
        }

        _loop(now) {
            const dt = Math.min((now - this.lastFrameTime) / 1000, 0.06);
            this.lastFrameTime = now;

            this._update(dt, now);
            this._render(now);

            requestAnimationFrame((t) => this._loop(t));
        }

        _update(dt, now) {
            // Acelerar suavemente al inicio hasta velocidad de crucero constante
            if (this.currentSpeed < MP_CONFIG.SPEED.MAX) {
                this.currentSpeed = Math.min(MP_CONFIG.SPEED.MAX, this.currentSpeed + MP_CONFIG.SPEED.ACCEL_RATE * dt);
            }

            // Ambos corredores avanzan juntos con la pista a la misma velocidad constante
            const activeSpeed = (this.p1.isAlive || this.p2.isAlive) ? this.currentSpeed : 0;
            this.worldZ += activeSpeed * dt;
            this.distanceMeters = Math.floor(this.worldZ / 10);

            // Generar obstáculos por delante
            this._spawnObstacles();

            // Actualizar P1
            this._updatePlayerPhysics(this.p1, dt, now);

            // Actualizar P2 (con IA automática de bot si está activa)
            this._updateP2Bot(dt);
            this._updatePlayerPhysics(this.p2, dt, now);

            // Actualizar obstáculos
            this._updateObstacles(dt);

            // Actualizar partículas
            this._updateParticles(dt);

            // Colisiones y 3 vidas
            this._checkCollisions(this.p1);
            this._checkCollisions(this.p2);

            // Actualizar HUD CONTEC y osciloscopios ECG
            this._updateHudText();
            this._drawEcgOscilloscope(this.p1EcgCtx, this.p1, this.p1EcgCanvas);
            this._drawEcgOscilloscope(this.p2EcgCtx, this.p2, this.p2EcgCanvas);

            // Fin de partida si ambos caen
            if (!this.isMatchOver && (!this.p1.isAlive && !this.p2.isAlive)) {
                this._triggerGameOver();
            }
        }

        _updatePlayerPhysics(player, dt, now) {
            if (!player.isAlive) return;

            // Suavizado lerp horizontal de carril
            const diff = player.lane - player.visualLane;
            player.visualLane += diff * Math.min(1, MP_CONFIG.LANES.LERP_SPEED * dt);

            // Animación de carrera
            player.stridePhase += dt * (this.currentSpeed * 0.016);

            // Temporizadores
            if (player.bActionTimer > 0) player.bActionTimer -= dt;
            if (player.invulnerableTimer > 0) player.invulnerableTimer -= dt;

            // Pulso cardíaco dinámico
            player.heartPulsePhase += dt * (player.bpm / 60) * Math.PI * 2;
            const targetBpm = 110 + Math.floor((this.currentSpeed / MP_CONFIG.SPEED.MAX) * 70);
            player.bpm = Math.round(player.bpm + (targetBpm - player.bpm) * Math.min(1, dt * 1.5));
        }

        _updateObstacles(dt) {
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];

                if (obs.flashTimer > 0) obs.flashTimer -= dt;

                if (obs.state === 'TOPPLING') {
                    obs.toppleProgress = Math.min(1.0, obs.toppleProgress + dt * 4.6);
                    if (obs.toppleProgress >= 1.0) obs.state = 'COLLAPSED';
                } else if (obs.state === 'SHATTERED') {
                    obs.shatterProgress = Math.min(1.0, obs.shatterProgress + dt * 3.8);
                }

                // Despawn cuando quede atrás
                if (obs.z < this.worldZ - 200) {
                    this.obstacles.splice(i, 1);
                }
            }
        }

        _checkCollisions(player) {
            if (!player.isAlive || player.invulnerableTimer > 0) return;

            for (const obs of this.obstacles) {
                if (obs.state === 'SHATTERED') continue;

                const sameLane = Math.abs(player.visualLane - obs.lane) < 0.44;
                const relZ = obs.z - this.worldZ;

                if (sameLane && Math.abs(relZ) <= 34) {
                    player.lives--;
                    player.invulnerableTimer = MP_CONFIG.COMBAT.INVULNERABLE_DURATION;

                    obs.state = 'SHATTERED';
                    this._spawnParticles(obs.screenX || 0, obs.screenY || 0, '#ff1e38', 24);

                    if (player.lives <= 0) {
                        player.lives = 0;
                        player.isAlive = false;
                        this._showPlayerEliminated(player);
                    }
                    break;
                }
            }
        }

        _showPlayerEliminated(player) {
            if (player.id === 1 && this.dom.p1ElimTag) {
                this.dom.p1ElimTag.classList.remove('hidden');
            } else if (player.id === 2 && this.dom.p2ElimTag) {
                this.dom.p2ElimTag.classList.remove('hidden');
            }
        }

        _triggerGameOver() {
            this.isMatchOver = true;

            let winnerText = '¡EMPATE!';
            let winnerColor = '#ffffff';

            if (this.p1.lives > this.p2.lives) {
                winnerText = '¡VICTORIA DEL JUGADOR 1!';
                winnerColor = '#2ec4b6';
            } else if (this.p2.lives > this.p1.lives) {
                winnerText = '¡VICTORIA DEL JUGADOR 2!';
                winnerColor = '#ff9f1c';
            }

            if (this.dom.resultWinner) {
                this.dom.resultWinner.textContent = winnerText;
                this.dom.resultWinner.style.color = winnerColor;
            }

            if (this.dom.resultDetails) {
                const km = (this.distanceMeters / 1000).toFixed(2);
                this.dom.resultDetails.innerHTML = `
                    DISTANCIA TOTAL: <strong style="color:#ffffff;">${km} km</strong> (${this.distanceMeters} m)<br/>
                    P1: ${this.p1.lives} VIDAS &nbsp;|&nbsp; P2: ${this.p2.lives} VIDAS
                `;
            }

            if (this.dom.resultsOverlay) {
                this.dom.resultsOverlay.classList.remove('hidden');
            }
        }

        rematch() {
            this.currentSpeed = MP_CONFIG.SPEED.INITIAL;
            this.worldZ = 0;
            this.distanceMeters = 0;
            this.isMatchOver = false;

            this.p1.lane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.visualLane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p1.isAlive = true;
            this.p1.invulnerableTimer = 0;

            this.p2.lane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.visualLane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p2.isAlive = true;
            this.p2.invulnerableTimer = 0;

            this.obstacles = [];
            this.particles = [];
            this.nextObsId = 1;
            this.nextSpawnZ = 480;

            if (this.dom.p1ElimTag) this.dom.p1ElimTag.classList.add('hidden');
            if (this.dom.p2ElimTag) this.dom.p2ElimTag.classList.add('hidden');
            if (this.dom.resultsOverlay) this.dom.resultsOverlay.classList.add('hidden');
        }

        _updateHudText() {
            const kmStr = (this.distanceMeters / 1000).toFixed(2);

            if (this.dom.odometer) this.dom.odometer.textContent = `${kmStr} km`;

            // Vidas P1
            if (this.dom.p1Lives) {
                this.dom.p1Lives.innerHTML = '♥ '.repeat(this.p1.lives).trim() || '💀 0';
            }
            // Vidas P2
            if (this.dom.p2Lives) {
                this.dom.p2Lives.innerHTML = '♥ '.repeat(this.p2.lives).trim() || '💀 0';
            }

            // BPM
            if (this.dom.p1Bpm) this.dom.p1Bpm.textContent = `${this.p1.bpm}`;
            if (this.dom.p2Bpm) this.dom.p2Bpm.textContent = `${this.p2.bpm}`;

            // Carriles
            if (this.dom.p1Lane) {
                this.dom.p1Lane.textContent = MP_CONFIG.LANES.NAMES[this.p1.lane];
            }
            if (this.dom.p2Lane) {
                this.dom.p2Lane.textContent = MP_CONFIG.LANES.NAMES[this.p2.lane];
            }

            // Barra de progreso y recorrido
            if (this.dom.p1ProgressLbl) this.dom.p1ProgressLbl.textContent = `RECORRIDO: ${kmStr} KM`;
            if (this.dom.p2ProgressLbl) this.dom.p2ProgressLbl.textContent = `RECORRIDO: ${kmStr} KM`;

            const progPct = Math.min(100, (this.distanceMeters / 10000) * 100).toFixed(1);
            if (this.dom.p1ProgressFill) this.dom.p1ProgressFill.style.width = `${progPct}%`;
            if (this.dom.p2ProgressFill) this.dom.p2ProgressFill.style.width = `${progPct}%`;

            if (this.dom.p1PursuitFill) {
                this.dom.p1PursuitFill.style.width = this.p1.isAlive ? '100%' : '0%';
            }
            if (this.dom.p2PursuitFill) {
                this.dom.p2PursuitFill.style.width = this.p2.isAlive ? '100%' : '0%';
            }
        }

        // ====================================================================
        // OSCILOSCOPIO ECG ANIMADO CON ONDA P-Q-R-S-T
        // ====================================================================

        _drawEcgOscilloscope(ctx, player, canvas) {
            if (!ctx || !canvas) return;

            const w = canvas.width || 220;
            const h = canvas.height || 36;
            const midY = h * 0.56;

            ctx.clearRect(0, 0, w, h);

            const isDead = !player.isAlive || player.bpm <= 0;
            const strokeColor = isDead ? '#ff3300' : (player.bpm >= 170 ? '#00ffcc' : '#33ff99');

            ctx.save();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.7;
            ctx.beginPath();

            const phaseCycles = (player.heartPulsePhase || 0) / (Math.PI * 2);
            const wavelengthPx = 64;
            let lastY = midY;

            for (let x = 0; x < w; x += 2) {
                let y = midY;
                if (!isDead) {
                    let c = ((x / wavelengthPx) - phaseCycles) % 1;
                    if (c < 0) c += 1;

                    // Complejo médico P-Q-R-S-T
                    if (c >= 0.12 && c < 0.22) {
                        const t = (c - 0.12) / 0.10;
                        y -= Math.sin(t * Math.PI) * 3.5;
                    } else if (c >= 0.27 && c < 0.31) {
                        const t = (c - 0.27) / 0.04;
                        y += Math.sin(t * Math.PI) * 3.5;
                    } else if (c >= 0.31 && c < 0.37) {
                        const t = (c - 0.31) / 0.06;
                        y -= Math.sin(t * Math.PI) * 14.0;
                    } else if (c >= 0.37 && c < 0.43) {
                        const t = (c - 0.37) / 0.06;
                        y += Math.sin(t * Math.PI) * 7.0;
                    } else if (c >= 0.50 && c < 0.66) {
                        const t = (c - 0.50) / 0.16;
                        y -= Math.sin(t * Math.PI) * 4.8;
                    }
                }
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                lastY = y;
            }
            ctx.stroke();

            // Punto de barrido fósforo
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(w - 3, lastY, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ====================================================================
        // RENDERIZADO VISUAL OPgender (CANVAS)
        // ====================================================================

        _render(now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            // 1. Cielo opresivo y grieta del horizonte
            this._drawSky(ctx, now);

            // 2. Edificios y siluetas ASCII a los lados
            this._drawAsciiRoadside(ctx, now);

            // 3. Pista de 6 Carriles con asfalto y líneas de velocidad
            this._drawTrack(ctx);

            // 4. LÍNEA CENTRAL NEGRA SÓLIDA Y GRUESA (Divisoria infranqueable)
            this._drawBlackDivider(ctx);

            // 5. Obstáculos proyectados
            this._drawObstacles(ctx);

            // 6. Corredores estilizados con silueta auténtica
            if (this.p1.isAlive) this._drawRunnerSilhouette(ctx, this.p1, now);
            if (this.p2.isAlive) this._drawRunnerSilhouette(ctx, this.p2, now);

            // 7. Partículas
            this._drawParticles(ctx);
        }

        _drawSky(ctx, now) {
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#040406');
            grad.addColorStop(0.32, '#0c0a12');
            grad.addColorStop(1, '#050507');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);

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

        _drawAsciiRoadside(ctx, now) {
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';

            for (const node of this.asciiBackgroundNodes) {
                let relZ = (node.z - (this.worldZ % MP_CONFIG.VISUALS.HORIZON_Z));
                if (relZ < -120) relZ += MP_CONFIG.VISUALS.HORIZON_Z;

                // Colocar fuera de los 6 carriles (a la izquierda de C1 o a la derecha de C6)
                const lanePos = 2.5 + node.side * node.offsetFactor * 2.8;
                const p = this.project(lanePos, relZ);
                const pillarH = 190 * node.heightFactor * p.scale;
                const pillarW = 24 * p.scale;

                if (pillarH < 4) continue;

                const bend = Math.sin(now * 0.002 + node.z) * 12 * p.scale * node.side;
                ctx.fillStyle = `rgba(16, 14, 22, ${Math.min(0.85, p.scale * 1.4)})`;
                ctx.beginPath();
                ctx.moveTo(p.x - pillarW * 0.5, p.y);
                ctx.lineTo(p.x + pillarW * 0.5, p.y);
                ctx.lineTo(p.x + pillarW * 0.4 + bend, p.y - pillarH);
                ctx.lineTo(p.x - pillarW * 0.4 + bend, p.y - pillarH);
                ctx.closePath();
                ctx.fill();

                if (p.scale > 0.22) {
                    ctx.fillStyle = `rgba(195, 40, 60, ${Math.min(0.45, p.scale * 0.6)})`;
                    ctx.fillText(node.glyph, p.x + bend * 0.5, p.y - pillarH * 0.5);
                }
            }
        }

        _drawTrack(ctx) {
            const nearP = this.project(2.5, -120);
            const farP = this.project(2.5, MP_CONFIG.VISUALS.HORIZON_Z);

            // Asfalto
            ctx.fillStyle = '#0a0a0f';
            ctx.beginPath();
            ctx.moveTo(farP.centerX - farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(farP.centerX + farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX + nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.lineTo(nearP.centerX - nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.closePath();
            ctx.fill();

            // Líneas de velocidad transversales
            const stepZ = 90;
            const offsetZ = stepZ - (this.worldZ % stepZ) - stepZ * 2;
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

            // Líneas divisoras de carriles
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
        // LÍNEA CENTRAL DIVISORIA NEGRA SÓLIDA Y GRUESA (BARRERA FÍSICA)
        // ====================================================================

        _drawBlackDivider(ctx) {
            ctx.save();

            // Base negra profunda
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 16;
            ctx.beginPath();
            for (let z = -120; z <= MP_CONFIG.VISUALS.HORIZON_Z; z += 80) {
                const p = this.project(2.5 + 0.0, z);
                if (z === -120) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // Muro 3D de concreto negro en relieve continuo
            for (let z = MP_CONFIG.VISUALS.HORIZON_Z; z >= -120; z -= 70) {
                const pNear = this.project(2.5 + 0.0, z);
                const pFar = this.project(2.5 + 0.0, z + 70);

                const barrierH = 28 * pNear.scale;
                const barrierW = Math.max(7, 16 * pNear.scale);

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

                // Lomo superior
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

        _drawObstacles(ctx) {
            const sorted = [...this.obstacles].sort((a, b) => b.z - a.z);

            for (const obs of sorted) {
                const relZ = obs.z - this.worldZ;
                if (relZ < -100 || relZ > MP_CONFIG.VISUALS.HORIZON_Z) continue;

                const p = this.project(obs.lane, relZ);
                obs.screenX = p.x;
                obs.screenY = p.y;

                if (obs.type === 'TOWER') {
                    this._drawTower(ctx, obs, p);
                } else if (obs.type === 'MONOLITH') {
                    this._drawMonolith(ctx, obs, p);
                } else {
                    this._drawBarricade(ctx, obs, p);
                }
            }
        }

        _drawTower(ctx, obs, p) {
            ctx.save();
            ctx.translate(p.x, p.y);

            let angle = 0;
            if (obs.state === 'TOPPLING') {
                angle = obs.tiltDir * obs.toppleProgress * 1.25;
            } else if (obs.state === 'COLLAPSED') {
                angle = obs.tiltDir * 1.30;
            }
            ctx.rotate(angle);

            const list = obs.tiltDir > 0 ? this.spriteImages.rightTowers : this.spriteImages.leftTowers;
            const chosenPath = list[obs.spriteIdx % list.length];
            const img = this.images[chosenPath];

            const spriteH = 220 * p.scale;
            const spriteW = spriteH * 0.72;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -spriteW * 0.5, -spriteH, spriteW, spriteH);
            } else {
                ctx.fillStyle = '#ffbe0b';
                ctx.fillRect(-spriteW * 0.5, -spriteH, spriteW, spriteH);
            }
            ctx.restore();
        }

        _drawMonolith(ctx, obs, p) {
            const h = 150 * p.scale;
            const w = p.laneWidth * 0.90;

            ctx.save();
            ctx.fillStyle = (obs.flashTimer > 0) ? '#551a24' : '#08080c';
            ctx.strokeStyle = (obs.flashTimer > 0) ? '#ffffff' : '#d90429';
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

        _drawBarricade(ctx, obs, p) {
            if (obs.state === 'SHATTERED' && obs.shatterProgress >= 1.0) return;

            const isDestroyed = (obs.state === 'SHATTERED');
            const path = isDestroyed
                ? this.spriteImages.barricadesDestroyed[obs.spriteIdx % this.spriteImages.barricadesDestroyed.length]
                : this.spriteImages.barricades[obs.spriteIdx % this.spriteImages.barricades.length];
            const img = this.images[path];

            const spriteW = p.laneWidth * 1.15;
            const spriteH = spriteW * 0.56;

            ctx.save();
            if (isDestroyed) {
                ctx.globalAlpha = Math.max(0, 1.0 - obs.shatterProgress);
            }

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, p.x - spriteW * 0.5, p.y - spriteH * 0.88, spriteW, spriteH);
            } else {
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(p.x - spriteW * 0.5, p.y - spriteH * 0.88, spriteW, spriteH);
            }
            ctx.restore();
        }

        // ====================================================================
        // SILUETA AUTÉNTICA DEL CORREDOR (IDÉNTICA AL JUEGO PRINCIPAL)
        // ====================================================================

        _drawRunnerSilhouette(ctx, player, now) {
            // Parpadeo de invulnerabilidad
            if (player.invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0) {
                return;
            }

            const p = this.project(player.visualLane, 0);

            // Balanceo físico de carrera
            const speedRatio = this.currentSpeed / MP_CONFIG.SPEED.MAX;
            const bobY = Math.abs(Math.sin(player.stridePhase)) * 10 * speedRatio;
            const tiltX = (player.lane - player.visualLane) * 0.28;

            ctx.save();
            ctx.translate(p.x, p.y - bobY);
            ctx.rotate(tiltX);

            // Sombra proyectada en el asfalto
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

            // Silueta estilizada y oscura del Corredor
            const bodyH = 74;
            const bodyW = 30;

            // Aura tensa con el color de su facción (Cyan P1 / Ámbar P2)
            ctx.strokeStyle = player.color;
            ctx.fillStyle = '#0b0c10';
            ctx.lineWidth = 2.4;

            // Torso / abrigo desgarrado
            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.5, 0);
            ctx.lineTo(-bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Cabeza con capucha
            ctx.beginPath();
            ctx.arc(0, -bodyH * 0.88, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Núcleo o símbolo de pulso en la espalda
            ctx.fillStyle = player.color;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(player.id === 1 ? 'P1' : (player.isBot ? '🤖' : 'P2'), 0, -bodyH * 0.38);

            // Guía diegética flotante de pulso BPM junto al corredor
            const heartImg = this.images[this.spriteImages.heart];
            ctx.save();
            ctx.translate(bodyW * 1.15, -bodyH * 0.58);
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = player.color;
            if (heartImg && heartImg.complete && heartImg.naturalWidth > 0) {
                ctx.drawImage(heartImg, 0, -11, 13, 13);
                ctx.fillText(`${player.bpm}`, 16, 0);
            } else {
                ctx.fillText(`♥ ${player.bpm}`, 0, 0);
            }
            ctx.restore();

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
                pt.vy += 650 * dt;
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

    window.addEventListener('DOMContentLoaded', () => {
        const app = new MultiplayerApp();
        app.start();
        window.MP_APP = app;
    });

})();
