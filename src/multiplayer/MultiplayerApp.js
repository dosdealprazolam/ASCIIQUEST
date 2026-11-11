/**
 * ============================================================================
 * PSYCHOLOGICAL SURVIVAL RUNNER — MULTIJUGADOR LOCAL (6 CARRILES / P1 vs P2)
 * ============================================================================
 * Módulo 100% independiente y desacoplado del juego individual.
 *
 * Mejoras aplicadas:
 *  - Velocidad vertiginosa exacta del juego base (860 u/s) desde el inicio.
 *  - Menor densidad y espaciado ampliado de obstáculos (560-640u) para permitir
 *    carreras rápidas y fluidas con rutas limpias y ritmo constante.
 *  - Ítems de Vidas Extra aleatorios en la pista con el corazón oficial (img/corazon.png)
 *    que curan hasta 3 vidas con aureola brillante, partículas y chime positivo.
 *  - Efectos visuales completos del juego principal:
 *      * Fondo abismal y grieta solar roja palpitante en el horizonte.
 *      * Viñeta psicológica de persecución y ansiedad en los bordes de la pantalla.
 *      * Líneas transversales de asfalto a alta velocidad que dan el frenetismo real.
 *      * Zonas de alcance contextual [B] proyectadas en el suelo (210u).
 *      * Ondas de choque en arco físico al golpear con [F] o [L].
 *      * Partículas de impacto ASCII (▓, ▪, ■) con gravedad y dispersión lateral.
 *      * Flash de pantalla reactivo (daño rojo, destrucción dorada, corazón rosa).
 *      * Vibración de cámara (screen shake) sutil y limpia, sin sacudidas bruscas.
 *      * Música de fondo oficial (Deejay SaeRo - Thud Weight.mp3) y audio procedimental.
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
            INITIAL: 760,        // Comienza con velocidad alta de carrera
            MAX: 860,            // Idéntico a MAX_RUN_SPEED en GameConfig.js
            ACCEL_RATE: 850      // Aceleración rápida hacia velocidad punta
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
            EXTRA_LIFE_STEP: 980,    // Intervalo de vidas extra
            EXTRA_LIFE_CHANCE: 0.38
        },
        VISUALS: {
            HORIZON_Z: 2800,
            TRACK_MAX_WIDTH: 1180,
            SCREEN_SHAKE_FACTOR: 0.65, // Vibración sutil pedida por el usuario
            SCREEN_SHAKE_DECAY: 13.5
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

        playWhoosh() {
            this._ensureCtx();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.15);
        }

        playSmash() {
            this._ensureCtx();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.23);
        }

        playDamage() {
            this._ensureCtx();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(95, now);
            osc.frequency.exponentialRampToValueAtTime(25, now + 0.32);

            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.33);
        }

        playHeart() {
            this._ensureCtx();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;

            // Doble campana armónica brillante
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

            // Idéntico a InputManager.js:
            // Respuesta instantánea al soltar el toque (< 260ms) si ya estaba habilitado el cambio
            if (this.laneSwitchReady && pressDuration <= this.TAP_MAX_DURATION_MS) {
                const relative = this.currentLane - this.minLane;
                const nextRel = (relative + 1) % this.laneCount;
                this.currentLane = this.minLane + nextRel;
            } else {
                // Al soltar tras mantener, desbloquea el cambio para el siguiente toque
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

            // Estado Jugador 1
            this.p1 = {
                id: 1,
                name: 'JUGADOR 1',
                lane: MP_CONFIG.LANES.P1_DEFAULT,
                visualLane: MP_CONFIG.LANES.P1_DEFAULT,
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

            // Estado Jugador 2
            this.p2 = {
                id: 2,
                name: 'JUGADOR 2',
                lane: MP_CONFIG.LANES.P2_DEFAULT,
                visualLane: MP_CONFIG.LANES.P2_DEFAULT,
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
            this.nextSpawnZ = 460;
            this.nextHeartZ = 900;

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
            this.sprites = {
                rightTowers: ['img/obstacle_yellow_right.png', 'img/obstacle_yellow_right_2.png', 'img/obstacle_yellow_right_3.png'],
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
            const all = [
                ...this.sprites.rightTowers,
                ...this.sprites.leftTowers,
                ...this.sprites.barricades,
                ...this.sprites.barricadesDestroyed,
                this.sprites.heart
            ];

            all.forEach(p => {
                const img = new Image();
                img.src = p;
                this.images[p] = img;
            });
        }

        _generateAsciiRoadside() {
            const glyphs = ['▓', '█', '▒', '░', '╪', '╬', '║', '¥', '§'];
            const nodes = [];
            for (let z = 0; z < MP_CONFIG.VISUALS.HORIZON_Z; z += 85) {
                nodes.push({
                    z,
                    side: -1,
                    glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                    heightFactor: 0.75 + Math.random() * 0.55,
                    offsetFactor: 1.15 + Math.random() * 0.35
                });
                nodes.push({
                    z,
                    side: 1,
                    glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
                    heightFactor: 0.75 + Math.random() * 0.55,
                    offsetFactor: 1.15 + Math.random() * 0.35
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
            // Vibración sutil pedida por el usuario: límite controlado para impacto agradable
            const scaled = amount * MP_CONFIG.VISUALS.SCREEN_SHAKE_FACTOR;
            this.shakeIntensity = Math.min(6.5, this.shakeIntensity + scaled);
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

                // Controles Jugador 1
                if (key === 'a') {
                    if (this.p1.isAuto) this.takeControlP1();
                    this.p1Ctrl.onKeyDown(now);
                } else if (key === 'f') {
                    if (this.p1.isAuto) this.takeControlP1();
                    this._triggerActionP1();
                }

                // Controles Jugador 2
                if (key === 'h') {
                    if (this.p2.isAuto) this.takeControlP2();
                    this.p2Ctrl.onKeyDown(now);
                } else if (key === 'l') {
                    if (this.p2.isAuto) this.takeControlP2();
                    this._triggerActionP2();
                }

                // Reiniciar partida con [R]
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
            this.sound.playWhoosh();
            this._executeStrike(this.p1);
        }

        _triggerActionP2() {
            if (!this.p2.isAlive) return;
            this.p2.bActionTimer = MP_CONFIG.COMBAT.ACTION_DURATION_MS / 1000;
            this.sound.playWhoosh();
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

            const targetRelZ = target.z - this.worldZ;
            const targetP = this.project(target.lane, targetRelZ);
            const partX = target.screenX || targetP.x;
            const partY = target.screenY || targetP.y;

            if (target.type === 'TOWER') {
                target.state = 'TOPPLING';
                target.toppleProgress = 0;
                target.lane = target.fallTargetLane;
                this.addShake(3.8);
                this._triggerFlash('#ffbf69', 0.16);
                this.sound.playSmash();
                this._spawnAsciiParticles(partX, partY, '#ffbe0b', 22);
            } else if (target.type === 'BARRICADE') {
                target.state = 'SHATTERED';
                target.shatterProgress = 0;
                this.addShake(4.2);
                this._triggerFlash('#ffbf69', 0.18);
                this.sound.playSmash();
                this._spawnAsciiParticles(partX, partY, '#cbd5e1', 24);
            } else if (target.type === 'MONOLITH') {
                target.flashTimer = 0.16;
                this.addShake(2.5);
                this.sound.playDamage();
                this._spawnAsciiParticles(partX, partY, '#ef4444', 12);
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

            // Si hay un corazón adelante en su carril o cercano, busca recogerlo
            const nearbyHeart = this.extraLives.find(h => {
                if (h.collected) return false;
                if (!validLanes.includes(h.lane)) return false;
                const relZ = h.z - this.worldZ;
                return relZ >= 40 && relZ <= 320;
            });

            if (nearbyHeart && player.botCooldown <= 0 && player.lane !== nearbyHeart.lane) {
                player.lane = nearbyHeart.lane;
                ctrl.currentLane = player.lane;
                player.botCooldown = 0.40;
                return;
            }

            const upcoming = this.obstacles.find(obs => {
                if (obs.state === 'SHATTERED' || obs.state === 'COLLAPSED') return false;
                if (obs.lane !== player.lane) return false;
                const relZ = obs.z - this.worldZ;
                return relZ >= 30 && relZ <= 230;
            });

            if (upcoming) {
                const relZ = upcoming.z - this.worldZ;
                if (upcoming.type === 'MONOLITH') {
                    if (player.botCooldown <= 0) {
                        const curIdx = player.lane - validLanes[0];
                        const nextRel = (curIdx + 1) % validLanes.length;
                        player.lane = validLanes[nextRel];
                        ctrl.currentLane = player.lane;
                        player.botCooldown = 0.42;
                    }
                } else if (relZ <= 180) {
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

            // Curvatura orgánica dinámica idéntica al juego original:
            const warpX = Math.sin((relZ + this.worldZ) * 0.0032) * (20 * (1 - perspective));

            const trackWidthAtPlayer = Math.min(this.width * 0.94, MP_CONFIG.VISUALS.TRACK_MAX_WIDTH);
            const currentTrackWidth = trackWidthAtPlayer * perspective;
            const laneWidth = currentTrackWidth / 6;

            // Centro exacto = 2.5 (entre Carril 3 y Carril 4)
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
        // GENERACIÓN DE OBSTÁCULOS Y VIDAS EXTRA (ESPACIADO FLUIDO)
        // ====================================================================

        _spawnWorldEntities() {
            // 1. Generación de obstáculos con espaciado amplio para mayor velocidad
            while (this.nextSpawnZ < this.worldZ + 1800) {
                const z = this.nextSpawnZ;

                // Lado P1 (Carriles 0, 1, 2)
                if (Math.random() < MP_CONFIG.SPAWN.OBSTACLE_CHANCE) {
                    const lP1 = Math.floor(Math.random() * 3);
                    this._createObstacle(lP1, z, MP_CONFIG.LANES.P1_LANES);
                }

                // Lado P2 (Carriles 3, 4, 5)
                if (Math.random() < MP_CONFIG.SPAWN.OBSTACLE_CHANCE) {
                    const lP2 = 3 + Math.floor(Math.random() * 3);
                    this._createObstacle(lP2, z, MP_CONFIG.LANES.P2_LANES);
                }

                this.nextSpawnZ += MP_CONFIG.SPAWN.STEP;
            }

            // 2. Generación de Vidas Extra aleatorias en el camino
            while (this.nextHeartZ < this.worldZ + 1800) {
                if (Math.random() < MP_CONFIG.SPAWN.EXTRA_LIFE_CHANCE) {
                    const side = Math.random() < 0.5 ? 0 : 3;
                    const lane = side + Math.floor(Math.random() * 3);

                    // Asegurar que no solape directamente en el mismo Z con un obstáculo existente
                    const hasConflict = this.obstacles.some(o => o.lane === lane && Math.abs(o.z - this.nextHeartZ) < 140);
                    if (!hasConflict) {
                        this.extraLives.push({
                            id: this.nextObsId++,
                            lane,
                            z: this.nextHeartZ,
                            collected: false
                        });
                    }
                }
                this.nextHeartZ += MP_CONFIG.SPAWN.EXTRA_LIFE_STEP + Math.floor(Math.random() * 300);
            }
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
            this._render(now, dt);

            requestAnimationFrame((t) => this._loop(t));
        }

        _update(dt, now) {
            // Aceleración rápida hacia velocidad máxima
            if (this.currentSpeed < MP_CONFIG.SPEED.MAX) {
                this.currentSpeed = Math.min(MP_CONFIG.SPEED.MAX, this.currentSpeed + MP_CONFIG.SPEED.ACCEL_RATE * dt);
            }

            const activeSpeed = (this.p1.isAlive || this.p2.isAlive) ? this.currentSpeed : 0;
            this.worldZ += activeSpeed * dt;
            this.distanceMeters = Math.floor(this.worldZ / 10);

            // Decaimiento de vibración y flash
            if (this.shakeIntensity > 0) {
                this.shakeIntensity = Math.max(0, this.shakeIntensity - MP_CONFIG.VISUALS.SCREEN_SHAKE_DECAY * dt);
            }
            if (this.flashAlpha > 0) {
                this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.0);
            }

            this._spawnWorldEntities();

            // Actualizar controladores de entrada
            this.p1Ctrl.update(now);
            this.p2Ctrl.update(now);

            // Actualizar pilotos automáticos
            this._updateAutoPilots(dt);

            // Sincronizar carril de jugadores
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
            if (!player.isAlive) return;

            const diff = player.lane - player.visualLane;
            player.visualLane += diff * Math.min(1, MP_CONFIG.LANES.SWITCH_LERP_SPEED * dt);

            player.stridePhase += dt * (this.currentSpeed * 0.018);

            if (player.bActionTimer > 0) player.bActionTimer -= dt;
            if (player.invulnerableTimer > 0) player.invulnerableTimer -= dt;

            player.heartPulsePhase += dt * (player.bpm / 60) * Math.PI * 2;
            const targetBpm = 110 + Math.floor((this.currentSpeed / MP_CONFIG.SPEED.MAX) * 70);
            player.bpm = Math.round(player.bpm + (targetBpm - player.bpm) * Math.min(1, dt * 2.0));
        }

        _updateObstacles(dt) {
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];

                if (obs.flashTimer > 0) obs.flashTimer -= dt;

                if (obs.state === 'TOPPLING') {
                    obs.toppleProgress = Math.min(1.0, obs.toppleProgress + dt * 4.8);
                    if (obs.toppleProgress >= 1.0) obs.state = 'COLLAPSED';
                } else if (obs.state === 'SHATTERED') {
                    obs.shatterProgress = Math.min(1.0, obs.shatterProgress + dt * 4.2);
                }

                if (obs.z < this.worldZ - 200) {
                    this.obstacles.splice(i, 1);
                }
            }
        }

        _updateExtraLives(dt) {
            for (let i = this.extraLives.length - 1; i >= 0; i--) {
                const item = this.extraLives[i];
                if (item.collected || item.z < this.worldZ - 200) {
                    this.extraLives.splice(i, 1);
                }
            }
        }

        _checkCollisions(player) {
            if (!player.isAlive) return;

            // 1. Recolección de Vida Extra (Corazón)
            for (const item of this.extraLives) {
                if (item.collected) continue;
                const sameLane = Math.abs(player.visualLane - item.lane) < 0.48;
                const relZ = item.z - this.worldZ;

                if (sameLane && Math.abs(relZ) <= 38) {
                    item.collected = true;
                    if (player.lives < MP_CONFIG.COMBAT.MAX_LIVES) {
                        player.lives++;
                    }
                    this.sound.playHeart();
                    this.addShake(2.0);
                    this._triggerFlash('#ff2a6d', 0.22);
                    const p = this.project(item.lane, relZ);
                    this._spawnHeartParticles(item.screenX || p.x, item.screenY || p.y, 24);
                }
            }

            // 2. Colisión con obstáculos (si no es invulnerable)
            if (player.invulnerableTimer > 0) return;

            for (const obs of this.obstacles) {
                if (obs.state === 'SHATTERED') continue;

                const sameLane = Math.abs(player.visualLane - obs.lane) < 0.44;
                const relZ = obs.z - this.worldZ;

                if (sameLane && Math.abs(relZ) <= 34) {
                    player.lives--;
                    player.invulnerableTimer = MP_CONFIG.COMBAT.INVULNERABLE_DURATION;

                    obs.state = 'SHATTERED';
                    this.sound.playDamage();
                    this.addShake(4.5);
                    this._triggerFlash('#ff1e38', 0.30);
                    const p = this.project(obs.lane, relZ);
                    this._spawnAsciiParticles(obs.screenX || p.x, obs.screenY || p.y, '#ff1e38', 26);

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
            this.shakeIntensity = 0;
            this.flashAlpha = 0;

            this.p1.lane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.visualLane = MP_CONFIG.LANES.P1_DEFAULT;
            this.p1.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p1.isAlive = true;
            this.p1.isAuto = true;
            this.p1.invulnerableTimer = 0;
            this.p1Ctrl.currentLane = MP_CONFIG.LANES.P1_DEFAULT;

            this.p2.lane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.visualLane = MP_CONFIG.LANES.P2_DEFAULT;
            this.p2.lives = MP_CONFIG.COMBAT.INITIAL_LIVES;
            this.p2.isAlive = true;
            this.p2.isAuto = true;
            this.p2.invulnerableTimer = 0;
            this.p2Ctrl.currentLane = MP_CONFIG.LANES.P2_DEFAULT;

            this.obstacles = [];
            this.extraLives = [];
            this.particles = [];
            this.nextObsId = 1;
            this.nextSpawnZ = 460;
            this.nextHeartZ = 900;

            this._updateStatusHints();

            if (this.dom.p1ElimTag) this.dom.p1ElimTag.classList.add('hidden');
            if (this.dom.p2ElimTag) this.dom.p2ElimTag.classList.add('hidden');
            if (this.dom.resultsOverlay) this.dom.resultsOverlay.classList.add('hidden');

            this.sound.startMusic();
        }

        _updateHudText() {
            const kmStr = (this.distanceMeters / 1000).toFixed(2);

            if (this.dom.odometer) this.dom.odometer.textContent = `${kmStr} km`;

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

            // Vibración sutil de pantalla (sin marear al usuario)
            if (this.shakeIntensity > 0.05) {
                const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.75;
                const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.75;
                ctx.translate(sx, sy);
            }

            // 1. Fondo abismal y horizonte opresivo
            this._drawSky(ctx, now);

            // 2. Pilares ASCII respirantes a los bordes
            this._drawAsciiRoadside(ctx, now);

            // 3. Pista de 6 carriles con líneas transversales de velocidad alta
            this._drawTrack(ctx);

            // 4. Muro central de separación física negra
            this._drawBlackDivider(ctx);

            // 5. Zonas de alcance contextual [B] proyectadas en el suelo
            if (this.p1.isAlive) this._drawContextualReachZone(ctx, this.p1);
            if (this.p2.isAlive) this._drawContextualReachZone(ctx, this.p2);

            // 6. Entidades del mundo (obstáculos y corazones) ordenados por profundidad (Painter's Alg)
            this._drawWorldEntities(ctx, now);

            // 7. Siluetas completas de ambos corredores
            if (this.p1.isAlive) this._drawRunner(ctx, this.p1, now);
            if (this.p2.isAlive) this._drawRunner(ctx, this.p2, now);

            // 8. Partículas de impacto / corazones
            this._drawParticles(ctx);

            // 9. Viñeta psicológica de persecución y bordes oscuros
            this._drawPursuitVignette(ctx, now);

            // 10. Flash reactivo de pantalla (daño / destrucción / vidas)
            if (this.flashAlpha > 0.01) {
                ctx.fillStyle = this.flashColor;
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillRect(0, 0, this.width, this.height);
                ctx.globalAlpha = 1.0;
            }

            ctx.restore();
        }

        _drawSky(ctx, now) {
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#040406');
            grad.addColorStop(0.28, '#0d0914');
            grad.addColorStop(1, '#050507');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);

            const horizonY = this.height * 0.23;
            const pulse = Math.sin(now * 0.0035) * 8;
            const rad = ctx.createRadialGradient(
                this.width * 0.5, horizonY, 8,
                this.width * 0.5, horizonY, 230 + pulse
            );
            rad.addColorStop(0, 'rgba(195, 20, 45, 0.32)');
            rad.addColorStop(0.55, 'rgba(55, 10, 25, 0.09)');
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

            // Asfalto oscuro
            ctx.fillStyle = '#0b0b10';
            ctx.beginPath();
            ctx.moveTo(farP.centerX - farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(farP.centerX + farP.currentTrackWidth * 0.5, farP.y);
            ctx.lineTo(nearP.centerX + nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.lineTo(nearP.centerX - nearP.currentTrackWidth * 0.5, nearP.y);
            ctx.closePath();
            ctx.fill();

            // Líneas transversales de asfalto a alta velocidad (sensación de vértigo)
            const stepZ = 85;
            const offsetZ = stepZ - (this.worldZ % stepZ) - stepZ * 2;
            for (let z = offsetZ; z < MP_CONFIG.VISUALS.HORIZON_Z; z += stepZ) {
                if (z < -120) continue;
                const p = this.project(2.5, z);
                const alpha = Math.min(0.32, p.scale * 0.42);
                ctx.strokeStyle = `rgba(140, 140, 170, ${alpha})`;
                ctx.lineWidth = Math.max(1, 2.2 * p.scale);
                ctx.beginPath();
                ctx.moveTo(p.centerX - p.currentTrackWidth * 0.5, p.y);
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

            // Sombra base gruesa negra
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
            const nearP = this.project(player.visualLane, 12);
            const farP = this.project(player.visualLane, MP_CONFIG.COMBAT.INTERACTION_RANGE);

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
            ].sort((a, b) => b.z - a.z);

            for (const item of entities) {
                const relZ = item.z - this.worldZ;
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
            const img = this.images[this.sprites.heart];
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

            // Brillo místico adicional
            if (p.scale > 0.30) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(9, Math.floor(13 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('+VIDA', p.x, drawY - size * 0.62);
            }

            ctx.restore();
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

            const list = obs.tiltDir > 0 ? this.sprites.rightTowers : this.sprites.leftTowers;
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
                ? this.sprites.barricadesDestroyed[obs.spriteIdx % this.sprites.barricadesDestroyed.length]
                : this.sprites.barricades[obs.spriteIdx % this.sprites.barricades.length];
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
        // SILUETA HUMANA DETALLADA DEL CORREDOR
        // ====================================================================

        _drawRunner(ctx, player, now) {
            if (player.invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0) {
                return;
            }

            const p = this.project(player.visualLane, 0);

            const speedRatio = this.currentSpeed / MP_CONFIG.SPEED.MAX;
            const bobY = Math.abs(Math.sin(player.stridePhase)) * 10 * speedRatio;
            const tiltX = (player.lane - player.visualLane) * 0.28;

            ctx.save();
            ctx.translate(p.x, p.y - bobY);
            ctx.rotate(tiltX);

            // Sombra en el suelo
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.beginPath();
            ctx.ellipse(0, bobY, 26, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Onda de choque física en arco expansivo al golpear
            if (player.bActionTimer > 0) {
                const progress = 1 - (player.bActionTimer / (MP_CONFIG.COMBAT.ACTION_DURATION_MS / 1000));
                const radius = 34 + progress * 65;
                ctx.strokeStyle = player.color;
                ctx.lineWidth = 4.0;
                ctx.beginPath();
                ctx.arc(0, -45 - progress * 20, radius, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }

            const bodyH = 74;
            const bodyW = 32;

            // Piernas en movimiento de carrera
            const legSwing = Math.sin(player.stridePhase) * 14 * speedRatio;
            ctx.fillStyle = '#07080b';
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 1.8;

            // Pierna izquierda
            ctx.beginPath();
            ctx.moveTo(-7, -10);
            ctx.lineTo(-9 + legSwing, 4);
            ctx.stroke();

            // Pierna derecha
            ctx.beginPath();
            ctx.moveTo(7, -10);
            ctx.lineTo(9 - legSwing, 4);
            ctx.stroke();

            // Torso / Abrigo largo desgarrado
            ctx.strokeStyle = player.color;
            ctx.fillStyle = '#0b0c10';
            ctx.lineWidth = 2.4;

            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.5, -6);
            ctx.lineTo(-bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.36, -bodyH * 0.72);
            ctx.lineTo(bodyW * 0.5, -6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Capucha / Cabeza
            ctx.beginPath();
            ctx.arc(0, -bodyH * 0.88, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Visor / Símbolo de pulso en la capucha
            ctx.fillStyle = player.color;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(player.id === 1 ? 'P1' : (player.isAuto ? 'AUTO' : 'P2'), 0, -bodyH * 0.38);

            // Indicador flotante diegético de BPM junto al corredor
            const heartImg = this.images[this.sprites.heart];
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
        // EFECTO VIÑETA PSICOLÓGICA DE PERSECUCIÓN
        // ====================================================================

        _drawPursuitVignette(ctx, now) {
            const rad = ctx.createRadialGradient(
                this.width * 0.5, this.height * 0.5, this.height * 0.35,
                this.width * 0.5, this.height * 0.5, this.height * 0.88
            );
            rad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            rad.addColorStop(0.7, 'rgba(15, 2, 5, 0.42)');
            rad.addColorStop(1, 'rgba(140, 8, 24, 0.52)');

            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // ====================================================================
        // PARTÍCULAS
        // ====================================================================

        _spawnAsciiParticles(x, y, color, count) {
            const chars = ['▓', '▪', '■', '╪', '╬'];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 380,
                    vy: -Math.random() * 260 - 80,
                    char: chars[Math.floor(Math.random() * chars.length)],
                    color,
                    life: 0.65,
                    maxLife: 0.65,
                    isAscii: true
                });
            }
        }

        _spawnHeartParticles(x, y, count) {
            const chars = ['♥', '★', '♦', '+'];
            for (let i = 0; i < count; i++) {
                this.particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 320,
                    vy: -Math.random() * 320 - 90,
                    char: chars[Math.floor(Math.random() * chars.length)],
                    color: Math.random() < 0.5 ? '#ff2a6d' : '#ffea79',
                    life: 0.85,
                    maxLife: 0.85,
                    isAscii: true
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
            ctx.textAlign = 'center';
            for (const pt of this.particles) {
                const alpha = Math.max(0, pt.life / pt.maxLife);
                ctx.fillStyle = pt.color;
                ctx.globalAlpha = alpha;
                if (pt.isAscii) {
                    ctx.font = 'bold 15px monospace';
                    ctx.fillText(pt.char, pt.x, pt.y);
                } else {
                    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
                }
            }
            ctx.globalAlpha = 1.0;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const game = new MultiplayerGame();
        game.start();
        window.MP_GAME = game;
    });

})();
