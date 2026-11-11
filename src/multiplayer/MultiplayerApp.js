/**
 * ============================================================================
 * PSYCHOLOGICAL SURVIVAL RUNNER — MULTIJUGADOR LOCAL (6 CARRILES / P1 vs P2)
 * ============================================================================
 * Módulo 100% independiente y desacoplado del juego individual.
 *
 * Implementa TODOS los efectos de video, estética y renderizado 2.5D del juego principal:
 *  - Pipeline gráfico idéntico a Renderer.js:
 *      * Sprites de torres y tótems (izq/der/raro/5000m) con recortes (crop sx, sy, sw, sh) exactos.
 *      * Barricadas frágiles y montones de cuerpos (05.png / 06.png) con crop y aspect ratios idénticos.
 *      * Sombras elípticas proyectadas en el asfalto bajo cada obstáculo y corredor.
 *      * Resplandor y halo de impacto en obstáculos (ctx.shadowBlur + ctx.shadowColor).
 *      * Partículas de impacto 2.5D en espacio del mundo (lane, z, yOffset, gravedad, caracteres ▓ y ▪).
 *      * Fondo de pesadilla con sol rojo palpitante y grieta en el horizonte.
 *      * Viñeta de persecución psicológica completa con oscuridad que asciende desde el borde inferior.
 *      * Silueta del corredor estilizada con aura, abrigo desgarrado, capucha y núcleo ASCII en la espalda (⚡ / ◊).
 *      * Corazones flotantes de Vida Extra (img/corazon.png) con halo de neón y efecto de recolección.
 *      * Asfalto fracturado con líneas transversales de velocidad que transmiten frenetismo real (860 u/s).
 *      * Zonas de alcance contextual [B] proyectadas en el suelo (210u).
 *      * Ondas de choque en arco frontal expansivo al golpear.
 *      * Vibración de cámara (screen shake) suave y calibrada sin marear.
 *      * Pista de audio oficial y síntesis procedimental por Web Audio API.
 *  - Doble Monitor Médico CONTEC con osciloscopio ECG en tiempo real y HUD responsivo.
 *  - Modo Automático Inicial para ambos corredores con transición instantánea a manual
 *    al pulsar cualquier tecla de su esquema ([A]/[F] para P1; [H]/[L] para P2).
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
            SWITCH_LERP_SPEED: 21.0
        },
        SPEED: {
            INITIAL: 1250,       // Velocidad vertiginosa inicial (mucho más rápida)
            MAX: 1560,           // Velocidad punta electrizante
            ACCEL_RATE: 2800,    // Aceleración instantánea y reactiva al pulsar/mantener
            DECEL_RATE: 1600,    // Desaceleración al soltar la tecla
            GRACE_DECEL: 340,    // Desaceleración casi nula durante micro-soltados de cambio de carril
            MOMENTUM_GRACE_MS: 400
        },
        COMBAT: {
            INITIAL_LIVES: 3,
            MAX_LIVES: 3,
            INVULNERABLE_DURATION: 1.3,
            INTERACTION_RANGE: 210, // Exacto del juego principal
            ACTION_DURATION_MS: 160
        },
        CONTROLS: {
            TAP_MAX_DURATION_MS: 260, // Exacto de GameConfig.js
            MOMENTUM_GRACE_MS: 420
        },
        SPAWN: {
            STEP: 560,               // Espaciado más amplio: menos congestión, más fluidez
            OBSTACLE_CHANCE: 0.44,   // Probabilidad moderada para asegurar carriles libres
            EXTRA_LIFE_STEP: 3400,   // Aparición muy ocasional (cada ~3.5 a 4.5 km)
            EXTRA_LIFE_CHANCE: 0.20  // Probabilidad baja para que sea un premio raro
        },
        VISUALS: {
            HORIZON_Z: 2800,
            TRACK_MAX_WIDTH: 1180,
            SCREEN_SHAKE_FACTOR: 1.0, // Vibración nítida y calibrada
            SCREEN_SHAKE_DECAY: 14.0
        },
        AUDIO: {
            MUSIC_TRACK: 'music/Deejay SaeRo - Thud Weight.mp3',
            FALLBACK_TRACK: 'music/level1_track.wav',
            VOLUME: 0.70
        }
    };

    /**
     * Sintetizador de audio procedimental por Web Audio API para efectos inmediatos
     */
    class SoundEngine {
        constructor() {
            this.ctx = null;
            this.musicAudio = null;
            this.musicStarted = false;
        }

        _ensureCtx() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        initMusic() {
            if (this.musicAudio) return;
            try {
                this.musicAudio = new Audio();
                this.musicAudio.loop = true;
                this.musicAudio.volume = MP_CONFIG.AUDIO.VOLUME;

                let triedFallback = false;
                this.musicAudio.onerror = () => {
                    if (!triedFallback) {
                        triedFallback = true;
                        this.musicAudio.src = encodeURI(MP_CONFIG.AUDIO.FALLBACK_TRACK);
                        this.musicAudio.load();
                        if (this.musicStarted) this.musicAudio.play().catch(() => {});
                    }
                };

                this.musicAudio.src = encodeURI(MP_CONFIG.AUDIO.MUSIC_TRACK);
                this.musicAudio.load();
            } catch (e) {
                // Audio no disponible
            }
        }

        startMusic() {
            this._ensureCtx();
            this.musicStarted = true;
            if (!this.musicAudio) this.initMusic();
            if (this.musicAudio && this.musicAudio.paused) {
                this.musicAudio.play().catch(() => {});
            }
        }

        // Sonidos de golpes, barridos y daño silenciados a petición del usuario para modo multijugador
        playWhoosh() {}
        playSmash() {}
        playDamage() {}

        playHeart() {
            this._ensureCtx();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;

            [880, 1320].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const t = now + idx * 0.08;

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.25);

                gain.gain.setValueAtTime(0.22, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.36);
            });
        }
    }

    /**
     * Controlador de entrada con la máquina de estados idéntica a InputManager.js
     */
    class PlayerInputController {
        constructor(minLane, laneCount, defaultLane) {
            this.minLane = minLane;
            this.laneCount = laneCount;
            this.currentLane = defaultLane;

            this.isHoldingRun = true;
            this.pressTime = 0;
            this.releaseTime = 0;
            this.laneSwitchReady = true;

            this.TAP_MAX_DURATION_MS = MP_CONFIG.CONTROLS.TAP_MAX_DURATION_MS;
        }

        onKeyDown(now) {
            if (this.isHoldingRun) return;
            this.isHoldingRun = true;
            this.pressTime = now;
        }

        onKeyUp(now) {
            if (!this.isHoldingRun) return;
            this.isHoldingRun = false;
            this.releaseTime = now;

            const pressDuration = now - this.pressTime;

            if (this.laneSwitchReady && pressDuration <= this.TAP_MAX_DURATION_MS) {
                const relative = this.currentLane - this.minLane;
                const nextRel = (relative + 1) % this.laneCount;
                this.currentLane = this.minLane + nextRel;
            } else {
                this.laneSwitchReady = true;
            }
        }

        update(now) {
            if (this.isHoldingRun) {
                const heldTime = now - this.pressTime;
                if (heldTime > this.TAP_MAX_DURATION_MS) {
                    this.laneSwitchReady = true;
                }
            }
        }
    }

    class MultiplayerGame {
        constructor() {
            this.canvas = document.getElementById('multiplayer-canvas');
            this.ctx = this.canvas.getContext('2d');

            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            this.currentSpeed = MP_CONFIG.SPEED.INITIAL;
            this.worldZ = 0;
            this.distanceMeters = 0;
            this.lastFrameTime = performance.now();
            this.isMatchOver = false;

            // Efectos de cámara y feedback visual del juego principal
            this.shakeIntensity = 0;
            this.flashAlpha = 0;
            this.flashColor = '#ff1e38';

            this.sound = new SoundEngine();

            // Controladores de carril independientes
            this.p1Ctrl = new PlayerInputController(0, 3, MP_CONFIG.LANES.P1_DEFAULT);
            this.p2Ctrl = new PlayerInputController(3, 3, MP_CONFIG.LANES.P2_DEFAULT);

            // Estado Jugador 1 (Velocidad, posición Z y distancia 100% independientes)
            this.p1 = {
                id: 1,
                name: 'JUGADOR 1',
                lane: MP_CONFIG.LANES.P1_DEFAULT,
                visualLane: MP_CONFIG.LANES.P1_DEFAULT,
                speed: MP_CONFIG.SPEED.INITIAL,
                maxSpeed: MP_CONFIG.SPEED.MAX,
                z: 0,
                distanceMeters: 0,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isAuto: true,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                heartPulsePhase: 0,
                stridePhase: 0,
                color: '#2ec4b6',
                accentColor: '#5eead4',
                botCooldown: 0
            };

            // Estado Jugador 2 (Velocidad, posición Z y distancia 100% independientes)
            this.p2 = {
                id: 2,
                name: 'JUGADOR 2',
                lane: MP_CONFIG.LANES.P2_DEFAULT,
                visualLane: MP_CONFIG.LANES.P2_DEFAULT,
                speed: MP_CONFIG.SPEED.INITIAL,
                maxSpeed: MP_CONFIG.SPEED.MAX,
                z: 0,
                distanceMeters: 0,
                lives: MP_CONFIG.COMBAT.INITIAL_LIVES,
                isAlive: true,
                isAuto: true,
                invulnerableTimer: 0,
                bActionTimer: 0,
                bpm: 110,
                heartPulsePhase: 0,
                stridePhase: 0,
                color: '#ff9f1c',
                accentColor: '#fde68a',
                botCooldown: 0
            };

            this.obstacles = [];
            this.extraLives = [];
            this.particles = [];
            this.nextObsId = 1;

            // Spawns independientes por corredor
            this.nextSpawnZP1 = 1400;
            this.nextSpawnZP2 = 1400;
            this.nextHeartZP1 = 2800;
            this.nextHeartZP2 = 2800;

            this.matchElapsed = 0;
            this.WARMUP_DURATION = 11.0; // 10-12 segundos de calentamiento inicial

            this.asciiBackgroundNodes = this._generateAsciiRoadside();

            this.p1EcgCanvas = document.getElementById('p1-ecg-canvas');
            this.p1EcgCtx = this.p1EcgCanvas ? this.p1EcgCanvas.getContext('2d') : null;

            this.p2EcgCanvas = document.getElementById('p2-ecg-canvas');
            this.p2EcgCtx = this.p2EcgCanvas ? this.p2EcgCanvas.getContext('2d') : null;

            this.dom = {
                p1ModeTag: document.getElementById('p1-mode-tag'),
                p2ModeTag: document.getElementById('p2-mode-tag'),
                p1StatusText: document.getElementById('p1-control-status'),
                p2StatusText: document.getElementById('p2-control-status'),
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
                p1ElimTag: document.getElementById('p1-elimination-tag'),
                p2ElimTag: document.getElementById('p2-elimination-tag'),
                resultsOverlay: document.getElementById('mp-results-overlay'),
                resultWinner: document.getElementById('mp-result-winner'),
                resultDetails: document.getElementById('mp-result-details'),
                btnRematch: document.getElementById('btn-rematch')
            };

            this._loadAssets();
            this._setupResize();
            this._bindKeyboard();
            this._bindUI();
        }

        _loadAssets() {
            // 1. Sprites para caída a la derecha (con recortes exactos de Renderer.js)
            const rightPaths = [
                'img/obstacle_yellow_right.png',
                'img/obstacle_yellow_right_2.png',
                'img/obstacle_yellow_right_3.png',
                'img/obstacle_yellow_right_4.png'
            ];
            this.yellowRightSprites = rightPaths.map(p => {
                const img = new Image();
                img.src = p;
                return img;
            });

            this.yellowRightRareImg = new Image();
            this.yellowRightRareImg.src = 'img/obstacle_yellow_right_rare.png';

            this.yellowRight5000Img = new Image();
            this.yellowRight5000Img.src = 'img/obstacle_yellow_right_5000.png';

            // 2. Sprites para caída a la izquierda (con recortes exactos de Renderer.js)
            const leftPaths = [
                'img/obstacle_yellow_left.png',
                'img/obstacle_yellow_left_2.png',
                'img/obstacle_yellow_left_3.png',
                'img/obstacle_yellow_left_4.png'
            ];
            this.yellowLeftSprites = leftPaths.map(p => {
                const img = new Image();
                img.src = p;
                return img;
            });

            // 3. Variantes de barricadas con recortes exactos y aspect ratios idénticos al principal
            const variantsCfg = [
                {
                    intact: 'img/barricade_intact.png',
                    destroyed: 'img/barricade_destroyed.png',
                    crop: { sx: 45, sy: 105, sw: 498, sh: 235 },
                    aspect: 228 / 492
                },
                {
                    intact: 'img/05.png',
                    destroyed: 'img/06.png',
                    crop: { sx: 20, sy: 65, sw: 545, sh: 330 },
                    aspect: 317 / 535
                }
            ];

            this.barricadeVariants = variantsCfg.map(cfg => {
                const intactImg = new Image();
                intactImg.src = cfg.intact;
                const destroyedImg = new Image();
                destroyedImg.src = cfg.destroyed;
                return {
                    intactImg,
                    destroyedImg,
                    crop: cfg.crop,
                    aspect: cfg.aspect
                };
            });

            // 4. Icono oficial de corazón
            this.heartImg = new Image();
            this.heartImg.src = 'img/corazon.png';
        }

        _generateAsciiRoadside() {
            const glyphs = ['░', '▒', '▓', '█', '†', '‡', '§', 'Ø', '∆', '◊', '¶', '#', '/', '\\', '|'];
            const nodes = [];
            for (let i = 0; i < 48; i++) {
                nodes.push({
                    z: (i * 60) % MP_CONFIG.VISUALS.HORIZON_Z,
                    side: (i % 2 === 0) ? -1 : 1,
                    glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                    heightFactor: 0.45 + Math.random() * 1.35,
                    offsetFactor: 1.25 + Math.random() * 1.6
                });
            }
            return nodes;
        }

        _setupResize() {
            const applySize = () => {
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                this.dpr = Math.min(window.devicePixelRatio || 1, 2);

                this.canvas.width = this.width * this.dpr;
                this.canvas.height = this.height * this.dpr;
                this.ctx.resetTransform();
                this.ctx.scale(this.dpr, this.dpr);
            };

            applySize();
            window.addEventListener('resize', applySize);
        }

        addShake(amount) {
            const scaled = amount * MP_CONFIG.VISUALS.SCREEN_SHAKE_FACTOR;
            this.shakeIntensity = Math.min(10.0, this.shakeIntensity + scaled);
        }

        _triggerFlash(color, alpha = 0.22) {
            this.flashColor = color;
            this.flashAlpha = Math.min(0.55, this.flashAlpha + alpha);
        }

        _bindKeyboard() {
            window.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                const now = performance.now();
                const key = e.key.toLowerCase();

                this.sound.startMusic();

                if (key === 'a') {
                    if (this.p1.isAuto) this.takeControlP1();
                    this.p1Ctrl.onKeyDown(now);
                } else if (key === 'f') {
                    if (this.p1.isAuto) this.takeControlP1();
                    this._triggerActionP1();
                }

                if (key === 'h') {
                    if (this.p2.isAuto) this.takeControlP2();
                    this.p2Ctrl.onKeyDown(now);
                } else if (key === 'l') {
                    if (this.p2.isAuto) this.takeControlP2();
                    this._triggerActionP2();
                }

                if (key === 'r') {
                    this.rematch();
                }
            });

            window.addEventListener('keyup', (e) => {
                const now = performance.now();
                const key = e.key.toLowerCase();

                if (key === 'a') {
                    this.p1Ctrl.onKeyUp(now);
                    if (!this.p1.isAuto) this.p1.lane = this.p1Ctrl.currentLane;
                } else if (key === 'h') {
                    this.p2Ctrl.onKeyUp(now);
                    if (!this.p2.isAuto) this.p2.lane = this.p2Ctrl.currentLane;
                }
            });
        }

        _bindUI() {
            if (this.dom.p2ModeTag) {
                this.dom.p2ModeTag.style.cursor = 'pointer';
                this.dom.p2ModeTag.addEventListener('click', () => {
                    this.sound.startMusic();
                    this.takeControlP2();
                });
            }

            if (this.dom.p2StatusText) {
                this.dom.p2StatusText.style.cursor = 'pointer';
                this.dom.p2StatusText.addEventListener('click', () => {
                    this.sound.startMusic();
                    this.takeControlP2();
                });
            }

            if (this.dom.btnRematch) {
                this.dom.btnRematch.addEventListener('click', () => this.rematch());
            }

            window.addEventListener('click', () => {
                this.sound.startMusic();
            }, { once: true });
        }

        takeControlP1() {
            if (!this.p1.isAuto) return;
            this.p1.isAuto = false;
            this.p1Ctrl.currentLane = this.p1.lane;
            this._updateStatusHints();
        }

        takeControlP2() {
            if (!this.p2.isAuto) return;
            this.p2.isAuto = false;
            this.p2Ctrl.currentLane = this.p2.lane;
            this._updateStatusHints();
        }

        _updateStatusHints() {
            if (this.dom.p1ModeTag) {
                this.dom.p1ModeTag.textContent = this.p1.isAuto ? 'P1 (AUTO)' : 'P1 (MANUAL)';
                this.dom.p1ModeTag.style.color = this.p1.isAuto ? '#94a3b8' : '#2ec4b6';
            }
            if (this.dom.p1StatusText) {
                this.dom.p1StatusText.innerHTML = this.p1.isAuto
                    ? '<span style="color:#94a3b8;">AUTO (PULSA [A] O [F] PARA CONTROLAR)</span>'
                    : '<span style="color:#2ec4b6; font-weight:bold;">[A] TAP: CAMBIAR &nbsp;|&nbsp; [F] GOLPE</span>';
            }

            if (this.dom.p2ModeTag) {
                this.dom.p2ModeTag.textContent = this.p2.isAuto ? 'P2 (AUTO)' : 'P2 (MANUAL)';
                this.dom.p2ModeTag.style.color = this.p2.isAuto ? '#94a3b8' : '#ff9f1c';
            }
            if (this.dom.p2StatusText) {
                this.dom.p2StatusText.innerHTML = this.p2.isAuto
                    ? '<span style="color:#ffbe0b; text-decoration:underline;">AUTO (CLIC O PULSA [H]/[L] PARA CONTROLAR)</span>'
                    : '<span style="color:#ff9f1c; font-weight:bold;">[H] TAP: CAMBIAR &nbsp;|&nbsp; [L] GOLPE</span>';
            }
        }

        _triggerActionP1() {
            if (!this.p1.isAlive) return;
            this.p1.bActionTimer = MP_CONFIG.COMBAT.ACTION_DURATION_MS / 1000;
            this._executeStrike(this.p1);
        }

        _triggerActionP2() {
            if (!this.p2.isAlive) return;
            this.p2.bActionTimer = MP_CONFIG.COMBAT.ACTION_DURATION_MS / 1000;
            this._executeStrike(this.p2);
        }

        _executeStrike(player) {
            // Rango dinámico generoso calibrado para velocidad independiente alta (hasta 1560 u/s)
            // A 1500 u/s, otorga aprox. 320-380ms de tiempo de reacción justo y fluido
            const speedFactor = Math.max(1.0, player.speed / 500);
            const range = Math.max(420, Math.round(MP_CONFIG.COMBAT.INTERACTION_RANGE * speedFactor));
            const isP1 = (player.id === 1);

            const target = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED') return false;
                if (obs.state === 'TOPPLING') return false;
                if (isP1 ? obs.lane >= 3 : obs.lane < 3) return false;

                // Tolerancia fluida de carril (comprueba carril destino y carril visual en transición)
                const distToTargetLane = Math.abs(obs.lane - player.lane);
                const distToVisualLane = Math.abs(obs.lane - player.visualLane);
                const laneDist = Math.min(distToTargetLane, distToVisualLane);
                if (laneDist > 0.65) return false;

                const relZ = obs.z - player.z;
                return relZ >= -42 && relZ <= range;
            });

            if (!target) return;

            target.hitFlashTimer = 0.35;
            target.clearedByPlayer = player.id;
            target.clearedLane = target.lane;

            if (target.type === 'TOWER') {
                target.state = 'TOPPLING';
                target.toppleProgress = 0;
                // Vibración sutil de pantalla en todo el viewport al derribar
                this.addShake(4.2);
                this._triggerFlash('#ffbf69', 0.20);
            } else if (target.type === 'BARRICADE') {
                target.state = 'SHATTERED';
                target.shatterProgress = 0;
                // Vibración sutil de pantalla en todo el viewport al romper
                this.addShake(3.6);
                this._triggerFlash('#ff9f1c', 0.22);
            } else if (target.type === 'MONOLITH') {
                target.flashTimer = 0.25;
                this.addShake(2.0);
            }
        }

        // ====================================================================
        // COMPORTAMIENTO AUTOMÁTICO (BOT / PILOTO INICIAL)
        // ====================================================================

        _updateAutoPilots(dt) {
            if (this.p1.isAuto && this.p1.isAlive) {
                this._runAutoLogic(this.p1, this.p1Ctrl, MP_CONFIG.LANES.P1_LANES, dt);
            }
            if (this.p2.isAuto && this.p2.isAlive) {
                this._runAutoLogic(this.p2, this.p2Ctrl, MP_CONFIG.LANES.P2_LANES, dt);
            }
        }

        _runAutoLogic(player, ctrl, validLanes, dt) {
            if (player.botCooldown > 0) {
                player.botCooldown -= dt;
            }

            const nearbyHeart = this.extraLives.find(h => {
                if (h.collected) return false;
                if (!validLanes.includes(h.lane)) return false;
                const relZ = h.z - player.z;
                return relZ >= 40 && relZ <= 380;
            });

            if (nearbyHeart && player.botCooldown <= 0 && player.lane !== nearbyHeart.lane) {
                player.lane = nearbyHeart.lane;
                ctrl.currentLane = player.lane;
                player.botCooldown = 0.35;
                return;
            }

            const upcoming = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED' || obs.state === 'TOPPLING') return false;
                if (!validLanes.includes(obs.lane)) return false;
                const laneDist = Math.abs(obs.lane - player.lane);
                if (laneDist > 0.45) return false;
                const relZ = obs.z - player.z;
                return relZ >= 30 && relZ <= 340;
            });

            if (upcoming) {
                const relZ = upcoming.z - player.z;
                if (upcoming.type === 'MONOLITH') {
                    if (player.botCooldown <= 0) {
                        const curIdx = player.lane - validLanes[0];
                        const nextRel = (curIdx + 1) % validLanes.length;
                        player.lane = validLanes[nextRel];
                        ctrl.currentLane = player.lane;
                        player.botCooldown = 0.38;
                    }
                } else if (relZ <= 260) {
                    player.bActionTimer = 0.16;
                    this._executeStrike(player);
                }
            }
        }

        // ====================================================================
        // PROYECCIÓN 2.5D ELEVADA CON CURVAS ORGÁNICAS (WARPX)
        // ====================================================================

        project(laneFloat, relZ) {
            const horizonY = this.height * 0.23;
            const playerScreenY = this.height * 0.88;
            const maxZ = MP_CONFIG.VISUALS.HORIZON_Z;

            const clampedZ = Math.max(-130, relZ);
            const normZ = Math.min(1, Math.max(-0.10, clampedZ / maxZ));
            const perspective = 1 / (1 + normZ * 4.6);

            const y = horizonY + (playerScreenY - horizonY) * perspective;

            const refZ = (laneFloat < 3) ? (this.p1.z || 0) : (this.p2.z || 0);
            const warpX = Math.sin((relZ + refZ) * 0.0032) * (20 * (1 - perspective));

            const trackWidthAtPlayer = Math.min(this.width * 0.94, MP_CONFIG.VISUALS.TRACK_MAX_WIDTH);
            const currentTrackWidth = trackWidthAtPlayer * perspective;
            const laneWidth = currentTrackWidth / 6;

            const centeredOffset = (laneFloat - 2.5) * laneWidth;
            const centerX = this.width * 0.5 + warpX;
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
        // GENERACIÓN DE OBSTÁCULOS CON CALENTAMIENTO (10-12 SEGUNDOS)
        // ====================================================================

        _spawnWorldEntities() {
            const inWarmup = this.matchElapsed < this.WARMUP_DURATION;

            // 1. Spawning para carril JUGADOR 1 (según la velocidad y avance Z de P1)
            while (this.nextSpawnZP1 < this.p1.z + 2200) {
                const z = this.nextSpawnZP1;
                if (inWarmup) {
                    if (this.matchElapsed >= 4.5 && Math.random() < 0.45) {
                        const lP1 = Math.floor(Math.random() * 3);
                        this._createWarmupBarricade(lP1, z);
                    }
                    this.nextSpawnZP1 += 1150;
                } else {
                    if (Math.random() < MP_CONFIG.SPAWN.OBSTACLE_CHANCE) {
                        const lP1 = Math.floor(Math.random() * 3);
                        this._createObstacle(lP1, z, MP_CONFIG.LANES.P1_LANES);
                    }
                    this.nextSpawnZP1 += MP_CONFIG.SPAWN.STEP;
                }
            }

            // 2. Spawning para carril JUGADOR 2 (según la velocidad y avance Z de P2)
            while (this.nextSpawnZP2 < this.p2.z + 2200) {
                const z = this.nextSpawnZP2;
                if (inWarmup) {
                    if (this.matchElapsed >= 4.5 && Math.random() < 0.45) {
                        const lP2 = 3 + Math.floor(Math.random() * 3);
                        this._createWarmupBarricade(lP2, z);
                    }
                    this.nextSpawnZP2 += 1150;
                } else {
                    if (Math.random() < MP_CONFIG.SPAWN.OBSTACLE_CHANCE) {
                        const lP2 = 3 + Math.floor(Math.random() * 3);
                        this._createObstacle(lP2, z, MP_CONFIG.LANES.P2_LANES);
                    }
                    this.nextSpawnZP2 += MP_CONFIG.SPAWN.STEP;
                }
            }

            // 3. Vidas extra independientes para P1
            while (this.nextHeartZP1 < this.p1.z + 2400) {
                if (Math.random() < MP_CONFIG.SPAWN.EXTRA_LIFE_CHANCE) {
                    const lane = Math.floor(Math.random() * 3);
                    const hasConflict = this.obstacles.some(o => o.lane === lane && Math.abs(o.z - this.nextHeartZP1) < 140);
                    if (!hasConflict) {
                        this.extraLives.push({
                            id: this.nextObsId++,
                            lane,
                            z: this.nextHeartZP1,
                            collected: false
                        });
                    }
                }
                this.nextHeartZP1 += MP_CONFIG.SPAWN.EXTRA_LIFE_STEP + Math.floor(Math.random() * 1200);
            }

            // 4. Vidas extra independientes para P2
            while (this.nextHeartZP2 < this.p2.z + 2400) {
                if (Math.random() < MP_CONFIG.SPAWN.EXTRA_LIFE_CHANCE) {
                    const lane = 3 + Math.floor(Math.random() * 3);
                    const hasConflict = this.obstacles.some(o => o.lane === lane && Math.abs(o.z - this.nextHeartZP2) < 140);
                    if (!hasConflict) {
                        this.extraLives.push({
                            id: this.nextObsId++,
                            lane,
                            z: this.nextHeartZP2,
                            collected: false
                        });
                    }
                }
                this.nextHeartZP2 += MP_CONFIG.SPAWN.EXTRA_LIFE_STEP + Math.floor(Math.random() * 1200);
            }
        }

        _createWarmupBarricade(lane, z) {
            this.obstacles.push({
                id: this.nextObsId++,
                lane,
                z,
                type: 'BARRICADE',
                fallTargetLane: null,
                tiltDir: 1,
                state: 'ACTIVE',
                toppleProgress: 0,
                shatterProgress: 0,
                flashTimer: 0,
                hitFlashTimer: 0,
                isRareRightVariant: false,
                is5000RightVariant: false,
                spriteVariantIndex: Math.floor(Math.random() * 4)
            });
        }

        _createObstacle(lane, z, validLanes) {
            const r = Math.random();
            let type = 'BARRICADE';
            let fallTarget = null;
            let tiltDir = 1;

            if (r < 0.42) {
                type = 'TOWER';
                if (lane === validLanes[0]) {
                    fallTarget = validLanes[1];
                    tiltDir = 1;
                } else if (lane === validLanes[2]) {
                    fallTarget = validLanes[1];
                    tiltDir = -1;
                } else {
                    tiltDir = Math.random() < 0.5 ? -1 : 1;
                    fallTarget = (tiltDir === 1) ? validLanes[2] : validLanes[0];
                }
            } else if (r < 0.65) {
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
                hitFlashTimer: 0,
                isRareRightVariant: (tiltDir > 0 && Math.random() < 0.22),
                is5000RightVariant: (tiltDir > 0 && this.worldZ > 45000 && Math.random() < 0.35),
                spriteVariantIndex: Math.floor(Math.random() * 4)
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
            this._render(now, dt);

            requestAnimationFrame((t) => this._loop(t));
        }

        _update(dt, now) {
            this.matchElapsed += dt;

            if (this.shakeIntensity > 0) {
                this.shakeIntensity = Math.max(0, this.shakeIntensity - MP_CONFIG.VISUALS.SCREEN_SHAKE_DECAY * dt);
            }
            if (this.flashAlpha > 0) {
                this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.0);
            }

            this._spawnWorldEntities();

            this.p1Ctrl.update(now);
            this.p2Ctrl.update(now);

            this._updateAutoPilots(dt);

            if (!this.p1.isAuto) this.p1.lane = this.p1Ctrl.currentLane;
            if (!this.p2.isAuto) this.p2.lane = this.p2Ctrl.currentLane;

            this._updatePlayerState(this.p1, dt, now);
            this._updatePlayerState(this.p2, dt, now);

            this._updateObstacles(dt);
            this._updateExtraLives(dt);
            this._updateParticles(dt);

            this._checkCollisions(this.p1);
            this._checkCollisions(this.p2);

            this._updateHudText();
            this._drawEcg(this.p1EcgCtx, this.p1, this.p1EcgCanvas);
            this._drawEcg(this.p2EcgCtx, this.p2, this.p2EcgCanvas);

            if (!this.isMatchOver && (!this.p1.isAlive && !this.p2.isAlive)) {
                this._finishMatch();
            }
        }

        _updatePlayerState(player, dt, now) {
            if (!player.isAlive) {
                player.speed = Math.max(0, player.speed - MP_CONFIG.SPEED.DECEL_RATE * dt);
                return;
            }

            const ctrl = (player.id === 1) ? this.p1Ctrl : this.p2Ctrl;
            const isHoldingRun = player.isAuto ? true : ctrl.isHoldingRun;
            const timeSinceRelease = now - ctrl.releaseTime;
            const inMomentumGrace = !isHoldingRun && (timeSinceRelease <= MP_CONFIG.SPEED.MOMENTUM_GRACE_MS);

            // Aceleración y velocidad completamente independiente por corredor
            if (isHoldingRun) {
                if (player.speed < player.maxSpeed) {
                    player.speed = Math.min(player.maxSpeed, player.speed + MP_CONFIG.SPEED.ACCEL_RATE * dt);
                }
            } else if (inMomentumGrace) {
                // Micro-soltado (<0.25s) conserva casi toda la inercia sin perder vértigo
                const minGraceSpeed = player.maxSpeed * 0.88;
                player.speed = Math.max(minGraceSpeed, player.speed - MP_CONFIG.SPEED.GRACE_DECEL * dt);
            } else {
                // Al soltar por completo la tecla de carrera, desacelera suavemente
                player.speed = Math.max(0, player.speed - MP_CONFIG.SPEED.DECEL_RATE * dt);
            }

            if (player.speed > 0) {
                player.z += player.speed * dt;
                player.distanceMeters = Math.floor(player.z / 10);
            }

            const diff = player.lane - player.visualLane;
            player.visualLane += diff * Math.min(1, MP_CONFIG.LANES.SWITCH_LERP_SPEED * dt);

            player.stridePhase += dt * (player.speed * 0.019);

            if (player.bActionTimer > 0) player.bActionTimer -= dt;
            if (player.invulnerableTimer > 0) player.invulnerableTimer -= dt;

            // Fisiología de BPM idéntica a campaña:
            // Sube progresivamente de 110 hasta 180 BPM conforme corre a máxima velocidad
            const speedRatio = player.maxSpeed > 0 ? (player.speed / player.maxSpeed) : 0;
            const targetBpm = 110 + Math.floor(speedRatio * 70);
            player.bpm = Math.round(player.bpm + (targetBpm - player.bpm) * Math.min(1, dt * 2.8));

            player.heartPulsePhase += dt * (player.bpm / 60) * Math.PI * 2;
        }

        _updateObstacles(dt) {
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];

                if (obs.flashTimer > 0) obs.flashTimer -= dt;
                if (obs.hitFlashTimer > 0) obs.hitFlashTimer -= dt;

                if (obs.state === 'TOPPLING') {
                    obs.toppleProgress = Math.min(1.0, obs.toppleProgress + dt * 4.8);
                    if (obs.toppleProgress >= 1.0) obs.state = 'COLLAPSED';
                } else if (obs.state === 'SHATTERED') {
                    obs.shatterProgress = Math.min(1.0, obs.shatterProgress + dt * 4.2);
                }

                // Limpieza independiente según el corredor de ese lado
                const playerRefZ = (obs.lane < 3) ? this.p1.z : this.p2.z;
                if (obs.z < playerRefZ - 200) {
                    this.obstacles.splice(i, 1);
                }
            }
        }

        _updateExtraLives(dt) {
            for (let i = this.extraLives.length - 1; i >= 0; i--) {
                const item = this.extraLives[i];
                const playerRefZ = (item.lane < 3) ? this.p1.z : this.p2.z;
                if (item.collected || item.z < playerRefZ - 200) {
                    this.extraLives.splice(i, 1);
                }
            }
        }

        _checkCollisions(player) {
            if (!player.isAlive) return;

            const isP1 = (player.id === 1);

            // 1. Recolección de Vida Extra (Corazón)
            for (const item of this.extraLives) {
                if (item.collected) continue;
                if (isP1 ? item.lane >= 3 : item.lane < 3) continue;

                const laneDist = Math.abs(player.visualLane - item.lane);
                const relZ = item.z - player.z;

                if (laneDist <= 0.40 && Math.abs(relZ) <= 38) {
                    item.collected = true;
                    if (player.lives < MP_CONFIG.COMBAT.MAX_LIVES) {
                        player.lives++;
                    }
                    this.sound.playHeart();
                    this.addShake(2.0);
                    this._triggerFlash('#ff2a6d', 0.22);
                }
            }

            // 2. Colisión con obstáculos (si no es invulnerable)
            if (player.invulnerableTimer > 0) return;

            for (const obs of this.obstacles) {
                if (obs.state === 'SHATTERED') continue;
                if (isP1 ? obs.lane >= 3 : obs.lane < 3) continue;

                // Si la estructura fue golpeada con [B] y está cayendo (TOPPLING),
                // el carril original ya quedó 100% despejado y aún no termina de aplastar el destino
                if (obs.state === 'TOPPLING' && obs.toppleProgress < 0.78) {
                    continue;
                }

                // Si este jugador ya derribó/despejó esta estructura en su carril, no puede morir en su propio carril
                if (obs.clearedByPlayer === player.id && Math.abs(player.visualLane - obs.clearedLane) <= 0.45) {
                    continue;
                }

                // Una estructura derrumbada solo es letal en su carril de caída final (fallTargetLane)
                const effectiveObsLane = (obs.state === 'ACTIVE' || (obs.state === 'TOPPLING' && obs.toppleProgress < 0.78))
                    ? obs.lane
                    : (obs.fallTargetLane !== null && obs.fallTargetLane !== undefined ? obs.fallTargetLane : obs.lane);

                const laneDist = Math.abs(player.visualLane - effectiveObsLane);
                if (laneDist > 0.34) continue; // Tolerancia estricta y calibrada para evitar choques falsos

                const relZ = obs.z - player.z;
                if (relZ >= -18 && relZ <= 34) {
                    player.lives--;
                    player.invulnerableTimer = MP_CONFIG.COMBAT.INVULNERABLE_DURATION;

                    obs.state = 'SHATTERED';
                    this.addShake(6.5);
                    this._triggerFlash('#ff2a4b', 0.35);

                    if (player.lives <= 0) {
                        player.lives = 0;
                        player.isAlive = false;
                        this._showEliminated(player);
                    }
                    break;
                }
            }
        }

        _showEliminated(player) {
            if (player.id === 1 && this.dom.p1ElimTag) {
                this.dom.p1ElimTag.classList.remove('hidden');
            } else if (player.id === 2 && this.dom.p2ElimTag) {
                this.dom.p2ElimTag.classList.remove('hidden');
            }
        }

        _finishMatch() {
            this.isMatchOver = true;

            let winnerText = '¡EMPATE!';
            let winnerColor = '#ffffff';

            if (this.p1.lives > 0 && this.p2.lives <= 0) {
                winnerText = '¡VICTORIA DEL JUGADOR 1 (SUPERVIVENCIA)!';
                winnerColor = '#2ec4b6';
            } else if (this.p2.lives > 0 && this.p1.lives <= 0) {
                winnerText = '¡VICTORIA DEL JUGADOR 2 (SUPERVIVENCIA)!';
                winnerColor = '#ff9f1c';
            } else if (this.p1.distanceMeters > this.p2.distanceMeters) {
                winnerText = `¡VICTORIA DEL JUGADOR 1 (+${this.p1.distanceMeters - this.p2.distanceMeters}m)!`;
                winnerColor = '#2ec4b6';
            } else if (this.p2.distanceMeters > this.p1.distanceMeters) {
                winnerText = `¡VICTORIA DEL JUGADOR 2 (+${this.p2.distanceMeters - this.p1.distanceMeters}m)!`;
                winnerColor = '#ff9f1c';
            }

            if (this.dom.resultWinner) {
                this.dom.resultWinner.textContent = winnerText;
                this.dom.resultWinner.style.color = winnerColor;
            }

            if (this.dom.resultDetails) {
                const km1 = (this.p1.distanceMeters / 1000).toFixed(2);
                const km2 = (this.p2.distanceMeters / 1000).toFixed(2);
                this.dom.resultDetails.innerHTML = `
                    P1: <strong style="color:#2ec4b6;">${km1} km</strong> (${Math.round(this.p1.speed)} u/s - ${this.p1.lives} vidas)<br/>
                    P2: <strong style="color:#ff9f1c;">${km2} km</strong> (${Math.round(this.p2.speed)} u/s - ${this.p2.lives} vidas)
                `;
            }

            if (this.dom.resultsOverlay) {
                this.dom.resultsOverlay.classList.remove('hidden');
            }
        }

        rematch() {
            this.isMatchOver = false;
            this.shakeIntensity = 0;
            this.flashAlpha = 0;

            this.p1.lane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.visualLane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.speed = MP_CONFIG.SPEED.INITIAL;
            this.p1.z = 0;
            this.p1.distanceMeters = 0;
            this.p1.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p1.isAlive = true;
            this.p1.isAuto = true;
            this.p1.invulnerableTimer = 0;
            this.p1Ctrl.currentLane = MP_CONFIG.LANES.P1_DEFAULT;

            this.p2.lane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.visualLane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.speed = MP_CONFIG.SPEED.INITIAL;
            this.p2.z = 0;
            this.p2.distanceMeters = 0;
            this.p2.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p2.isAlive = true;
            this.p2.isAuto = true;
            this.p2.invulnerableTimer = 0;
            this.p2Ctrl.currentLane = MP_CONFIG.LANES.P2_DEFAULT;

            this.obstacles = [];
            this.extraLives = [];
            this.particles = [];
            this.nextObsId = 1;

            this.nextSpawnZP1 = 1400;
            this.nextSpawnZP2 = 1400;
            this.nextHeartZP1 = 2800;
            this.nextHeartZP2 = 2800;

            this.matchElapsed = 0;
            this.WARMUP_DURATION = 11.0; // 10-12 segundos de calentamiento inicial

            this._updateStatusHints();

            if (this.dom.p1ElimTag) this.dom.p1ElimTag.classList.add('hidden');
            if (this.dom.p2ElimTag) this.dom.p2ElimTag.classList.add('hidden');
            if (this.dom.resultsOverlay) this.dom.resultsOverlay.classList.add('hidden');

            this.sound.startMusic();
        }

        _updateHudText() {
            const kmStr1 = (this.p1.distanceMeters / 1000).toFixed(2);
            const kmStr2 = (this.p2.distanceMeters / 1000).toFixed(2);

            // Odómetro Central: Comparador en vivo de ventaja en metros y velocidad
            if (this.dom.odometer) {
                const d1 = this.p1.distanceMeters;
                const d2 = this.p2.distanceMeters;
                const lead = d1 - d2;
                if (lead > 0) {
                    this.dom.odometer.innerHTML = `<span style="color:#2ec4b6; font-weight:bold;">▲ P1 +${lead}m</span> &nbsp;<span style="color:#94a3b8; font-size:11px;">(${kmStr1} km)</span>`;
                } else if (lead < 0) {
                    this.dom.odometer.innerHTML = `<span style="color:#ff9f1c; font-weight:bold;">▲ P2 +${-lead}m</span> &nbsp;<span style="color:#94a3b8; font-size:11px;">(${kmStr2} km)</span>`;
                } else {
                    this.dom.odometer.innerHTML = `<span style="color:#06d6a0;">EMPATE</span> &nbsp;<span style="color:#94a3b8; font-size:11px;">(${kmStr1} km)</span>`;
                }
            }

            if (this.dom.p1Lives) {
                this.dom.p1Lives.innerHTML = '♥ '.repeat(this.p1.lives).trim() || '💀 0';
            }
            if (this.dom.p2Lives) {
                this.dom.p2Lives.innerHTML = '♥ '.repeat(this.p2.lives).trim() || '💀 0';
            }

            if (this.dom.p1Bpm) this.dom.p1Bpm.textContent = `${this.p1.bpm}`;
            if (this.dom.p2Bpm) this.dom.p2Bpm.textContent = `${this.p2.bpm}`;

            if (this.dom.p1Lane) {
                this.dom.p1Lane.textContent = MP_CONFIG.LANES.NAMES[this.p1.lane];
            }
            if (this.dom.p2Lane) {
                this.dom.p2Lane.textContent = MP_CONFIG.LANES.NAMES[this.p2.lane];
            }

            if (this.dom.p1ProgressLbl) {
                this.dom.p1ProgressLbl.textContent = `RECORRIDO: ${kmStr1} KM (${Math.round(this.p1.speed)} u/s)`;
            }
            if (this.dom.p2ProgressLbl) {
                this.dom.p2ProgressLbl.textContent = `RECORRIDO: ${kmStr2} KM (${Math.round(this.p2.speed)} u/s)`;
            }

            const progPct1 = Math.min(100, (this.p1.distanceMeters / 10000) * 100).toFixed(1);
            const progPct2 = Math.min(100, (this.p2.distanceMeters / 10000) * 100).toFixed(1);
            if (this.dom.p1ProgressFill) this.dom.p1ProgressFill.style.width = `${progPct1}%`;
            if (this.dom.p2ProgressFill) this.dom.p2ProgressFill.style.width = `${progPct2}%`;

            if (this.dom.p1PursuitFill) {
                const ratio1 = Math.round((this.p1.speed / this.p1.maxSpeed) * 100);
                this.dom.p1PursuitFill.style.width = this.p1.isAlive ? `${ratio1}%` : '0%';
            }
            if (this.dom.p2PursuitFill) {
                const ratio2 = Math.round((this.p2.speed / this.p2.maxSpeed) * 100);
                this.dom.p2PursuitFill.style.width = this.p2.isAlive ? `${ratio2}%` : '0%';
            }
        }

        _drawEcg(ctx, player, canvas) {
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

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(w - 3, lastY, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ====================================================================
        // RENDERIZADO VISUAL COMPLETO DEL JUEGO PRINCIPAL
        // ====================================================================

        _render(now, dt) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            ctx.save();

            // Vibración sutil de pantalla (firme, perceptible pero ligera en todo el viewport)
            if (this.shakeIntensity > 0.05) {
                const sx = (Math.random() - 0.5) * this.shakeIntensity * 1.5;
                const sy = (Math.random() - 0.5) * this.shakeIntensity * 1.5;
                ctx.translate(sx, sy);
            }

            // 1. Fondo abismal y horizonte opresivo con sol rojo
            this._drawNightmareBackground(ctx, now);

            // 2. Pilares ASCII respirantes a los bordes
            this._drawAsciiRoadside(ctx, now);

            // 3. Pista de 6 carriles con líneas transversales de velocidad alta
            this._drawTrack(ctx);

            // 4. Muro central de separación física negra sólida
            this._drawBlackDivider(ctx);

            // 5. Zonas de alcance contextual [B] proyectadas en el suelo
            if (this.p1.isAlive) this._drawContextualReachZone(ctx, this.p1);
            if (this.p2.isAlive) this._drawContextualReachZone(ctx, this.p2);

            // 6. Entidades del mundo (obstáculos y corazones) ordenados por profundidad (Painter's Alg)
            this._drawWorldEntities(ctx, now);

            // 7. Siluetas completas de ambos corredores
            if (this.p1.isAlive) this._drawRunner(ctx, this.p1, now);
            if (this.p2.isAlive) this._drawRunner(ctx, this.p2, now);

            // 8. Partículas 2.5D en espacio del mundo
            this._updateAndDrawParticles(ctx, dt);

            // 9. Viñeta psicológica de persecución y oscuridad ascendente
            this._drawPursuitVignette(ctx, now);

            // 10. Flash reactivo de pantalla (daño / destrucción / vidas)
            if (this.flashAlpha > 0.01) {
                ctx.fillStyle = this.flashColor;
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillRect(0, 0, this.width, this.height);
                ctx.globalAlpha = 1.0;
            }

            // 11. Banner de calentamiento y apertura competitiva
            this._drawWarmupBanner(ctx);

            ctx.restore();
        }

        _drawWarmupBanner(ctx) {
            if (this.matchElapsed >= this.WARMUP_DURATION + 2.2) return;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const cx = this.width * 0.5;
            const bannerY = Math.max(90, this.height * 0.16);

            if (this.matchElapsed < this.WARMUP_DURATION) {
                const remaining = Math.max(0, this.WARMUP_DURATION - this.matchElapsed).toFixed(1);
                ctx.font = 'bold 14px monospace';
                const text = `⚡ CALENTAMIENTO: ${remaining}s (PREPARA TUS CONTROLES) ⚡`;
                const textW = ctx.measureText(text).width + 32;

                ctx.fillStyle = 'rgba(8, 8, 14, 0.85)';
                ctx.strokeStyle = '#ff9f1c';
                ctx.lineWidth = 1.6;
                ctx.fillRect(cx - textW * 0.5, bannerY - 15, textW, 30);
                ctx.strokeRect(cx - textW * 0.5, bannerY - 15, textW, 30);

                ctx.fillStyle = '#ffbe0b';
                ctx.shadowColor = '#ff9f1c';
                ctx.shadowBlur = 10;
                ctx.fillText(text, cx, bannerY);
            } else {
                const fade = Math.max(0, 1.0 - (this.matchElapsed - this.WARMUP_DURATION) / 2.2);
                ctx.globalAlpha = fade;
                ctx.font = 'bold 15px monospace';
                const text = `🏁 ¡CARRERA ACTIVA - A TODO RITMO! 🏁`;
                const textW = ctx.measureText(text).width + 36;

                ctx.fillStyle = 'rgba(6, 18, 14, 0.90)';
                ctx.strokeStyle = '#06d6a0';
                ctx.lineWidth = 2.0;
                ctx.fillRect(cx - textW * 0.5, bannerY - 15, textW, 30);
                ctx.strokeRect(cx - textW * 0.5, bannerY - 15, textW, 30);

                ctx.fillStyle = '#06d6a0';
                ctx.shadowColor = '#06d6a0';
                ctx.shadowBlur = 14;
                ctx.fillText(text, cx, bannerY);
            }

            ctx.restore();
        }

        _drawNightmareBackground(ctx, now) {
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#040406');
            grad.addColorStop(0.28, '#0d0914');
            grad.addColorStop(1, '#050507');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);

            const horizonY = this.height * 0.23;
            // Sol rojo palpitante al ritmo del corazón de campaña
            const maxBpm = Math.max(this.p1.bpm || 110, this.p2.bpm || 110);
            const pulse = Math.sin(now * 0.0055 * (maxBpm / 110)) * 14;
            const rad = ctx.createRadialGradient(
                this.width * 0.5, horizonY, 8,
                this.width * 0.5, horizonY, 240 + pulse
            );
            rad.addColorStop(0, 'rgba(215, 25, 50, 0.45)');
            rad.addColorStop(0.35, 'rgba(145, 15, 35, 0.22)');
            rad.addColorStop(0.70, 'rgba(45, 8, 20, 0.08)');
            rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, this.width, this.height * 0.58);

            // Grieta carmesí en el horizonte (efecto de campaña)
            ctx.strokeStyle = 'rgba(255, 45, 80, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(this.width * 0.28, horizonY);
            ctx.lineTo(this.width * 0.72, horizonY);
            ctx.stroke();
        }

        _drawAsciiRoadside(ctx, now) {
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';

            for (const node of this.asciiBackgroundNodes) {
                // Cada lado del mundo avanza a la velocidad independiente de su corredor
                const playerRefZ = (node.side < 0) ? this.p1.z : this.p2.z;
                let relZ = (node.z - (playerRefZ % MP_CONFIG.VISUALS.HORIZON_Z));
                if (relZ < -120) relZ += MP_CONFIG.VISUALS.HORIZON_Z;

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

            // Asfalto fracturado oscuro
            ctx.fillStyle = '#0b0b10';
            ctx.beginPath();
            ctx.moveTo(farP.centerX - farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(farP.centerX + farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX + nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.lineTo(nearP.centerX - nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.closePath();
            ctx.fill();

            // Bordes exteriores carmesí brillantes (efecto de campaña)
            ctx.save();
            ctx.strokeStyle = '#d90429';
            ctx.lineWidth = Math.max(2, 3.5 * nearP.scale);
            ctx.shadowColor = '#ff2a4b';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(farP.centerX - farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX - nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.moveTo(farP.centerX + farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX + nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.stroke();
            ctx.restore();

            const stepZ = 80;

            // 1. Líneas transversales de asfalto para JUGADOR 1 (Carriles 0, 1, 2)
            // Se mueven a la velocidad INDEPENDIENTE de P1 (this.p1.z)
            const offsetZ1 = stepZ - (this.p1.z % stepZ) - stepZ * 2;
            for (let z = offsetZ1; z < MP_CONFIG.VISUALS.HORIZON_Z; z += stepZ) {
                if (z < -120) continue;
                const p = this.project(1.0, z);
                const alpha = Math.min(0.38, p.scale * 0.48);
                ctx.strokeStyle = `rgba(46, 196, 182, ${alpha})`;
                ctx.lineWidth = Math.max(1, 2.2 * p.scale);
                ctx.beginPath();
                ctx.moveTo(p.centerX - p.currentTrackWidth * 0.5, p.y);
                ctx.lineTo(p.centerX, p.y);
                ctx.stroke();
            }

            // 2. Líneas transversales de asfalto para JUGADOR 2 (Carriles 3, 4, 5)
            // Se mueven a la velocidad INDEPENDIENTE de P2 (this.p2.z)
            const offsetZ2 = stepZ - (this.p2.z % stepZ) - stepZ * 2;
            for (let z = offsetZ2; z < MP_CONFIG.VISUALS.HORIZON_Z; z += stepZ) {
                if (z < -120) continue;
                const p = this.project(4.0, z);
                const alpha = Math.min(0.38, p.scale * 0.48);
                ctx.strokeStyle = `rgba(255, 159, 28, ${alpha})`;
                ctx.lineWidth = Math.max(1, 2.2 * p.scale);
                ctx.beginPath();
                ctx.moveTo(p.centerX, p.y);
                ctx.lineTo(p.centerX + p.currentTrackWidth * 0.5, p.y);
                ctx.stroke();
            }

            // Divisores de carriles
            const dividers = [-3.0, -2.0, -1.0, 1.0, 2.0, 3.0];
            for (const div of dividers) {
                const isOuter = (div === -3.0 || div === 3.0);
                ctx.strokeStyle = isOuter ? 'rgba(215, 35, 55, 0.65)' : 'rgba(160, 165, 185, 0.18)';
                ctx.lineWidth = isOuter ? 2.5 : 1.2;

                ctx.beginPath();
                for (let z = -120; z <= MP_CONFIG.VISUALS.HORIZON_Z; z += 85) {
                    const p = this.project(2.5 + div, z);
                    if (z === -120) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
        }

        _drawBlackDivider(ctx) {
            ctx.save();

            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 16;
            ctx.beginPath();
            for (let z = -120; z <= MP_CONFIG.VISUALS.HORIZON_Z; z += 80) {
                const p = this.project(2.5 + 0.0, z);
                if (z === -120) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            for (let z = MP_CONFIG.VISUALS.HORIZON_Z; z >= -120; z -= 70) {
                const pNear = this.project(2.5 + 0.0, z);
                const pFar = this.project(2.5 + 0.0, z + 70);

                const barrierH = 28 * pNear.scale;
                const barrierW = Math.max(7, 16 * pNear.scale);

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

                ctx.fillStyle = '#111118';
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

        _drawContextualReachZone(ctx, player) {
            const speedFactor = Math.max(1.0, player.speed / 500);
            const reachRange = Math.max(420, Math.round(MP_CONFIG.COMBAT.INTERACTION_RANGE * speedFactor));
            const leadDelta = (player.id === 1) ? (this.p1.z - this.p2.z) : (this.p2.z - this.p1.z);
            const visualLeadZ = Math.max(-45, Math.min(65, leadDelta * 0.12));
            const nearP = this.project(player.visualLane, visualLeadZ + 12);
            const farP = this.project(player.visualLane, visualLeadZ + reachRange);

            const isUsingB = player.bActionTimer > 0;
            const alpha = isUsingB ? 0.38 : 0.09;
            ctx.strokeStyle = isUsingB ? player.accentColor : 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = isUsingB ? 2.5 : 1.0;

            ctx.beginPath();
            ctx.moveTo(nearP.x - nearP.laneWidth * 0.38, nearP.y);
            ctx.lineTo(farP.x - farP.laneWidth * 0.38, farP.y);
            ctx.lineTo(farP.x + farP.laneWidth * 0.38, farP.y);
            ctx.lineTo(nearP.x + nearP.laneWidth * 0.38, nearP.y);
            ctx.closePath();
            ctx.stroke();
        }

        // ====================================================================
        // RENDERIZADO DE ENTIDADES DEL MUNDO (OBSTÁCULOS Y CORAZONES)
        // ====================================================================

        _drawWorldEntities(ctx, now) {
            const entities = [
                ...this.obstacles.map(o => ({ kind: 'OBS', z: o.z, data: o })),
                ...this.extraLives.map(h => ({ kind: 'HEART', z: h.z, data: h }))
            ].sort((a, b) => {
                const relA = a.z - (a.data.lane < 3 ? this.p1.z : this.p2.z);
                const relB = b.z - (b.data.lane < 3 ? this.p1.z : this.p2.z);
                return relB - relA;
            });

            for (const item of entities) {
                const isP1 = (item.data.lane < 3);
                const playerRefZ = isP1 ? this.p1.z : this.p2.z;
                const relZ = item.z - playerRefZ;
                if (relZ < -100 || relZ > MP_CONFIG.VISUALS.HORIZON_Z) continue;

                if (item.kind === 'OBS') {
                    const obs = item.data;
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
                } else if (item.kind === 'HEART') {
                    const heart = item.data;
                    if (heart.collected) continue;
                    const p = this.project(heart.lane, relZ);
                    heart.screenX = p.x;
                    heart.screenY = p.y;
                    this._drawExtraLife(ctx, heart, p, now);
                }
            }
        }

        _drawExtraLife(ctx, heart, p, now) {
            const bob = Math.sin(now * 0.005 + heart.id) * 9 * p.scale;
            const drawY = p.y - 34 * p.scale - bob;

            ctx.save();

            // Sombra en el asfalto
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 16 * p.scale, 6 * p.scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Halo resplandeciente
            const glowR = Math.max(14, 38 * p.scale);
            const glow = ctx.createRadialGradient(p.x, drawY, 2, p.x, drawY, glowR);
            glow.addColorStop(0, 'rgba(255, 42, 109, 0.65)');
            glow.addColorStop(0.6, 'rgba(255, 107, 107, 0.22)');
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, drawY, glowR, 0, Math.PI * 2);
            ctx.fill();

            // Icono del Corazón oficial
            const img = this.heartImg;
            const size = Math.max(16, 42 * p.scale);

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, p.x - size * 0.5, drawY - size * 0.5, size, size);
            } else {
                ctx.fillStyle = '#ff2a6d';
                ctx.font = `bold ${Math.max(14, Math.floor(28 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('♥', p.x, drawY);
            }

            if (p.scale > 0.30) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(9, Math.floor(13 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('+VIDA', p.x, drawY - size * 0.62);
            }

            ctx.restore();
        }

        _drawTower(ctx, obs, p) {
            const tiltDir = obs.tiltDir;
            const isHitFlash = (obs.hitFlashTimer > 0);
            const variantSeed = typeof obs.spriteVariantIndex === 'number' ? obs.spriteVariantIndex : (obs.id || 0);

            // Selección de imagen y recorte idénticos a Renderer.js
            let chosenImg = null;
            let sx = tiltDir > 0 ? 105 : 45;
            let sy = 20;
            let sw = tiltDir > 0 ? 324 : 348;
            let sh = 448;

            if (tiltDir > 0 && obs.is5000RightVariant && this.yellowRight5000Img && this.yellowRight5000Img.complete) {
                chosenImg = this.yellowRight5000Img;
                sx = 20;
                sy = 45;
                sw = 410;
                sh = 435;
            } else if (tiltDir > 0 && obs.isRareRightVariant && this.yellowRightRareImg && this.yellowRightRareImg.complete) {
                chosenImg = this.yellowRightRareImg;
                sx = 80;
                sy = 30;
                sw = 350;
                sh = 440;
            } else {
                const list = (tiltDir > 0) ? this.yellowRightSprites : this.yellowLeftSprites;
                chosenImg = list[variantSeed % list.length];
            }

            let spriteAngle = 0;
            if (obs.state === 'TOPPLING') {
                spriteAngle = tiltDir * obs.toppleProgress * 1.18;
            } else if (obs.state === 'COLLAPSED') {
                spriteAngle = tiltDir * 1.25;
            }

            const spriteH = 245 * p.scale;
            const spriteW = spriteH * (sw / sh);
            const drawX = tiltDir > 0 ? (-spriteW * 0.43) : (-spriteW * 0.57);
            const drawY = -spriteH;

            ctx.save();
            ctx.translate(p.x, p.y);

            // Sombra elíptica idéntica al juego principal
            ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
            ctx.beginPath();
            ctx.ellipse(0, 0, p.laneWidth * 0.48, Math.max(3, 10 * p.scale), 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.rotate(spriteAngle);

            if (isHitFlash) {
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = Math.max(6, 16 * p.scale);
            }

            if (chosenImg && chosenImg.complete && chosenImg.naturalWidth > 0) {
                ctx.drawImage(chosenImg, sx, sy, sw, sh, drawX, drawY, spriteW, spriteH);
            } else {
                ctx.fillStyle = '#ffbe0b';
                ctx.fillRect(drawX, drawY, spriteW, spriteH);
            }

            if (isHitFlash) {
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }

        _drawMonolith(ctx, obs, p) {
            const h = 155 * p.scale;
            const w = p.laneWidth * 0.92;
            const isFlashing = (obs.flashTimer > 0);

            ctx.save();
            ctx.translate(p.x, p.y);

            // Sombra en el suelo
            ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
            ctx.beginPath();
            ctx.ellipse(0, 0, w * 0.50, Math.max(3, 9 * p.scale), 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isFlashing ? '#551a24' : '#09090d';
            ctx.strokeStyle = isFlashing ? '#ffffff' : '#d90429';
            ctx.lineWidth = Math.max(1.5, 3.0 * p.scale);

            ctx.fillRect(-w * 0.48, -h, w * 0.96, h);
            ctx.strokeRect(-w * 0.48, -h, w * 0.96, h);

            if (p.scale > 0.28) {
                ctx.fillStyle = isFlashing ? '#ffffff' : '#d90429';
                ctx.font = `bold ${Math.max(10, Math.floor(22 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('███', 0, -h * 0.55);
                ctx.fillText('▓▓▓', 0, -h * 0.25);
            }

            ctx.restore();
        }

        _drawBarricade(ctx, obs, p) {
            const isHitFlash = (obs.hitFlashTimer > 0);
            const isDestroyed = (obs.state === 'SHATTERED');
            const fadeAlpha = isDestroyed ? Math.max(0, 1.0 - (obs.shatterProgress || 0)) : 1.0;

            if (fadeAlpha <= 0.01) return;

            const variantSeed = typeof obs.spriteVariantIndex === 'number' ? obs.spriteVariantIndex : (obs.id || 0);
            const activeVariant = this.barricadeVariants[variantSeed % this.barricadeVariants.length];

            const w = p.laneWidth * 0.88;
            const spriteW = w * 1.15;
            const spriteH = spriteW * activeVariant.aspect;
            const drawX = -spriteW * 0.5;
            const drawY = -spriteH * 0.88;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.globalAlpha = fadeAlpha;

            // Sombra en el suelo bajo el montón
            ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
            ctx.beginPath();
            ctx.ellipse(0, 0, w * 0.58, Math.max(3, 9 * p.scale), 0, 0, Math.PI * 2);
            ctx.fill();

            if (isHitFlash) {
                ctx.shadowColor = '#ffea79';
                ctx.shadowBlur = Math.max(8, 20 * p.scale);
            }

            const currentImg = isDestroyed ? activeVariant.destroyedImg : activeVariant.intactImg;
            const crop = activeVariant.crop;

            if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
                ctx.drawImage(currentImg, crop.sx, crop.sy, crop.sw, crop.sh, drawX, drawY, spriteW, spriteH);
            } else {
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(drawX, drawY, spriteW, spriteH);
            }

            if (isHitFlash) {
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }

        // ====================================================================
        // SILUETA HUMANA DETALLADA DEL CORREDOR
        // ====================================================================

        _drawRunner(ctx, player, now) {
            if (player.invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0) {
                return;
            }

            // Posición visual relativa según ventaja/desventaja en metros
            const leadDelta = (player.id === 1) ? (this.p1.z - this.p2.z) : (this.p2.z - this.p1.z);
            const visualLeadZ = Math.max(-45, Math.min(65, leadDelta * 0.12));
            const p = this.project(player.visualLane, visualLeadZ);

            const speedRatio = player.maxSpeed > 0 ? (player.speed / player.maxSpeed) : 0;
            const bobY = Math.abs(Math.sin(player.stridePhase)) * 12 * speedRatio;
            const tiltX = (player.lane - player.visualLane) * 0.28;

            ctx.save();
            ctx.translate(p.x, p.y - bobY);
            ctx.rotate(tiltX);

            // Sombra proyectada en el carril
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.beginPath();
            ctx.ellipse(0, bobY, 26, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Onda de choque física cuando ejecuta la acción contextual B
            if (player.bActionTimer > 0) {
                const progress = 1 - (player.bActionTimer / (MP_CONFIG.COMBAT.ACTION_DURATION_MS / 1000));
                const radius = 34 + progress * 65;
                ctx.strokeStyle = player.color;
                ctx.lineWidth = 4.0;
                ctx.beginPath();
                ctx.arc(0, -45 - progress * 20, radius, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }

            // Silueta estilizada y oscura del Corredor
            const bodyH = 74;
            const bodyW = 30;

            ctx.strokeStyle = player.color;
            ctx.fillStyle = '#0b0c10';
            ctx.lineWidth = 2.5;

            // Torso / abrigo desgarrado
            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.5, 0);
            ctx.lineTo(-bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Cabeza / capucha
            ctx.beginPath();
            ctx.arc(0, -bodyH * 0.88, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Núcleo ASCII en la espalda del corredor (⚡ al golpear / ◊ en carrera)
            ctx.fillStyle = player.color;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(player.bActionTimer > 0 ? '⚡' : '◊', 0, -bodyH * 0.38);

            // Guía visual diegética de BPM junto al corredor con icono corazon.png que palpita
            const bpm = player.bpm || 110;
            const pulseScale = 1 + Math.max(0, Math.sin(player.heartPulsePhase || 0)) * 0.14;

            ctx.save();
            ctx.translate(bodyW * 1.15, -bodyH * 0.58);
            ctx.scale(pulseScale, pulseScale);
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = player.color;
            if (this.heartImg && this.heartImg.complete && this.heartImg.naturalWidth > 0) {
                ctx.drawImage(this.heartImg, 0, -11, 13, 13);
                ctx.fillText(`${bpm}`, 16, 0);
            } else {
                ctx.fillText(`♥ ${bpm}`, 0, 0);
            }
            ctx.restore();

            ctx.restore();
        }

        // ====================================================================
        // EFECTO VIÑETA PSICOLÓGICA DE PERSECUCIÓN Y OSCURIDAD ASCENDENTE
        // ====================================================================

        _drawPursuitVignette(ctx, now) {
            // Pulsación biológica conectada al BPM más alto (efecto de campaña)
            const maxBpm = Math.max(this.p1.bpm || 110, this.p2.bpm || 110);
            const pulse = Math.sin(now * 0.0055 * (maxBpm / 110)) * 0.08;
            const threat = Math.min(0.85, Math.max(0.40, 0.55 + pulse));
            const baseVignette = 0.45 + threat * 0.45;

            const rad = ctx.createRadialGradient(
                this.width * 0.5, this.height * 0.55, this.height * (0.38 - threat * 0.22),
                this.width * 0.5, this.height * 0.55, this.height * 0.85
            );
            rad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            rad.addColorStop(0.7, `rgba(15, 2, 5, ${baseVignette * 0.7})`);
            rad.addColorStop(1, `rgba(140, 8, 24, ${baseVignette})`);

            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, this.width, this.height);

            // Oscuridad y humo carmesí que asciende desde el borde inferior
            const creepH = this.height * 0.32 * threat;
            const bottomGrad = ctx.createLinearGradient(0, this.height, 0, this.height - creepH);
            bottomGrad.addColorStop(0, `rgba(180, 10, 30, ${0.52 * threat})`);
            bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = bottomGrad;
            ctx.fillRect(0, this.height - creepH, this.width, creepH);
        }

        // ====================================================================
        // GESTIÓN DE IMPACTOS Y BRILLO (SIN PARTÍCULAS DE TEXTO ASCII)
        // ====================================================================

        _spawnImpactParticles(lane, worldZ, color, count, lateralBias = 0) {
            // Eliminadas las expresiones / partículas de bloques ASCII (▓ y ▪) a petición del usuario.
            // Los obstáculos conservan el brillo y halo limpio original de Renderer.js.
        }

        _updateParticles(dt) {}

        _updateAndDrawParticles(ctx, dt) {}
    }

    window.addEventListener('DOMContentLoaded', () => {
        const game = new MultiplayerGame();
        game.start();
        window.MP_GAME = game;
    });

})();
