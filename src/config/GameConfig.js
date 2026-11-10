/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Configuración Global
 * ----------------------------------------------------
 * Incluye:
 *  - Alcance de golpe [B] realista y cercano (210 u).
 *  - Desaceleración física justa al empujar estructuras que caen hacia un lado.
 *  - Sistema de Latidos (BPM) con escalones terminados en 0 y 9 (180 -> 179 -> 170 -> 169).
 */
window.PSR = window.PSR || {};

const DEFAULT_CONFIG = {
    // --- CONFIGURACIÓN DE CARRILES ---
    LANES: {
        COUNT: 3,
        NAMES: ['CARRIL 1 (IZQ)', 'CARRIL 2 (CENTRO)', 'CARRIL 3 (DER)'],
        DEFAULT_LANE: 1,
        SWITCH_LERP_SPEED: 21.0
    },

    // --- FÍSICA DE CARRERA (CONTROL A) ---
    MOVEMENT: {
        MAX_RUN_SPEED: 860,
        ACCELERATION: 3100,
        MOMENTUM_GRACE_MS: 420,
        GRACE_DECELERATION: 320,
        STOP_DECELERATION: 1500,
        MIN_SPEED_THRESHOLD: 5,
        // Guardado exclusivamente para el futuro obstáculo tentativo (TENTATIVE_HEAVY_TOWER)
        SHOVE_SPEED_FACTOR: 0.62,
        SHOVE_SLOWDOWN_MS: 360
    },

    // --- SISTEMA DE LATIDOS DEL CORAZÓN (PROGRESIVO + TRAUMA POR IMPACTO + OSCILANTE) ---
    BPM: {
        INITIAL_ALERT_BPM: 110,       // Inicia en estado alerta moderado (109 ↔ 110 BPM)
        MAX_SPEED_BASE: 180,          // Llega progresivamente hasta el máximo (179 ↔ 180 BPM)
        BASE_BANDS: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180],
        RAMP_UP_RATE: 0.16,           // Velocidad con la que sube progresivamente mientras corres (~6s hasta 180 BPM)
        AFK_DELAY_SEC: 1.6,           // Tiempo detenido/AFK antes de que el corazón empiece a bajar hacia descanso
        AFK_COOLDOWN_RATE: 0.11,      // Solo cae hacia descanso (110) si el jugador se queda AFK sin correr
        STRIKE_BPM_BOOST: 3,          // Aumenta un par de BPMs (+3 BPM) cada vez que golpeas con [B]
        STRIKE_MAX_BOOST: 9,          // Tope de subida adicional si masheas [B] seguido
        STRIKE_DECAY_PER_SEC: 4.5,    // Velocidad a la que se estabiliza el pico tras golpear
        // Mecánica de Trauma Cardíaco para las Barricadas Básicas (FRAGILE_BARRICADE)
        HIT_BPM_DROP: 70,             // Cada golpe contra barricada baja únicamente 70 BPM
        REGEN_DELAY_SINGLE_SEC: 1.0,  // Tiempo de regeneración normal: 1 segundo después del golpe
        REGEN_DELAY_COMBO_SEC: 2.0,   // Si recibe 2 golpes seguidos en <5s: 2 segundos después del último golpe
        COMBO_WINDOW_SEC: 5.0,        // Pasados 5 segundos desde el golpe, vuelve a su regeneración normal (1s)
        MIN_SURVIVAL_BPM: 0,          // Si tras restar 70 BPM cae a <= 0 (sin BPMs), muere
        SMOOTH_SPEED: 7.5,
        HEART_ICON_PATH: 'img/corazon.png'
    },

    // --- TIEMPOS DE RESPUESTA Y RANGO CORREGIDO (CONTROL A Y B) ---
    CONTROLS: {
        TAP_MAX_DURATION_MS: 260,
        DOUBLE_TAP_WINDOW_MS: 500,
        B_ACTION_DURATION_MS: 160,
        B_BUFFER_WINDOW_MS: 140,      // Buffer fluido para golpe cercano sin fallar a alta velocidad
        B_INTERACTION_RANGE: 210,     // Distancia de ataque corregida y realista
        B_MIN_RANGE: -42,
        // Guardado únicamente para el obstáculo tentativo (TENTATIVE_HEAVY_TOWER)
        TENTATIVE_KNOCKBACK_Z: 95,
        TRIGGER_THRESHOLD: 0.08,      // Gatillo ultra sensible: detecta con apenas 8% de recorrido
        TRIGGER_RAPID_DELTA: 0.035    // Rearmado instantáneo: basta liberar un 3.5% para volver a golpear
    },

    // --- MÚSICA DEL NIVEL (CARPETA /music/ DEL PROYECTO) ---
    MUSIC: {
        PRIMARY_TRACK: 'music/Deejay SaeRo - Thud Weight.mp3',
        LEVEL_0_TRACK: 'music/level1_track.wav',
        FALLBACK_TRACK: 'music/level1_track.wav',
        DEFAULT_VOLUME: 0.78,
        DEATH_REVERB_DURATION_MS: 680
    },

    // --- PROGRESIÓN DE DIFICULTAD: RUTA DE 10,200 METROS ---
    DIFFICULTY: {
        METERS_PER_LEVEL: 2000,       // Cada nivel dura 2000m para una curva suave y progresiva sin picos abruptos
        MAX_LEVEL: 5,
        RACE_GOAL_METERS: 10200,      // Largo de la ruta con +200 metros adicionales (10,200 metros)
        LEVELS: [
            {
                level: 1,
                name: 'NIVEL 1 — FALSO CONTROL',
                subtitle: '0m a 2000m: Adaptación enganchante + Entrada gradual de muros amarillos',
                speedMultiplier: 1.00,
                spawnSpacing: 490,
                doubleLaneChance: 0.0,
                monolithChance: 0.0,
                collapsingChance: 0.34,
                minHits: 1,
                maxHits: 1
            },
            {
                level: 2,
                name: 'NIVEL 2 — TENSIÓN DE IMPACTO',
                subtitle: '2000m a 4000m: Barricadas de 2 golpes + Primeros cruces dobles',
                speedMultiplier: 1.06,
                spawnSpacing: 445,
                doubleLaneChance: 0.22,
                monolithChance: 0.0,
                collapsingChance: 0.42,
                minHits: 1,
                maxHits: 2
            },
            {
                level: 3,
                name: 'NIVEL 3 — RUPTURA',
                subtitle: '4000m a 6000m: Entran Monolitos Sólidos de forma progresiva',
                speedMultiplier: 1.12,
                spawnSpacing: 405,
                doubleLaneChance: 0.36,
                monolithChance: 0.28,
                collapsingChance: 0.40,
                minHits: 1,
                maxHits: 2
            },
            {
                level: 4,
                name: 'NIVEL 4 — FRENESÍ',
                subtitle: '6000m a 8000m: Alta densidad + Lectura rápida de carriles',
                speedMultiplier: 1.19,
                spawnSpacing: 365,
                doubleLaneChance: 0.52,
                monolithChance: 0.34,
                collapsingChance: 0.38,
                minHits: 1,
                maxHits: 2
            },
            {
                level: 5,
                name: 'NIVEL 5 — PESADILLA TOTAL',
                subtitle: '8000m a 10200m: Recta final extrema hacia la meta',
                speedMultiplier: 1.26,
                spawnSpacing: 330,
                doubleLaneChance: 0.66,
                monolithChance: 0.36,
                collapsingChance: 0.38,
                minHits: 2,
                maxHits: 3
            }
        ]
    },

    // --- PRESIÓN PSICOLÓGICA / PERSECUCIÓN ---
    PURSUIT: {
        INITIAL_DISTANCE: 100,
        RECOVERY_RATE: 15,
        APPROACH_RATE_WHEN_SLOW: 48,
        DANGER_THRESHOLD: 40
    },

    // --- GENERACIÓN Y DIMENSIONES DE OBSTÁCULOS ---
    OBSTACLES: {
        SPAWN_DISTANCE: 1450,
        DESPAWN_DISTANCE: -180,
        PLAYER_HITBOX_DEPTH: 34,
        LANE_TOLERANCE: 0.36,
        TOPPLING_SPEED: 5.8,          // Caída rápida y fluida como estaba antes
        TENTATIVE_HEAVY_TOPPLING_SPEED: 3.8, // Guardado solo para el obstáculo tentativo futuro
        YELLOW_RIGHT_SPRITE_PATH: 'img/obstacle_yellow_right.png',
        YELLOW_RIGHT_SPRITE_PATHS: [
            'img/obstacle_yellow_right.png',
            'img/obstacle_yellow_right_2.png',
            'img/obstacle_yellow_right_3.png',
            'img/obstacle_yellow_right_4.png'
        ],
        YELLOW_RIGHT_RARE_SPRITE_PATH: 'img/obstacle_yellow_right_rare.png',
        YELLOW_RIGHT_RARE_MIN_DISTANCE_METERS: 2000, // Disponible a partir de Nivel 2 (2,000m)
        YELLOW_RIGHT_RARE_CHANCE: 0.20,              // ~20% de probabilidad para mayor presencia visual (1 de cada 5 hacia la derecha)
        YELLOW_RIGHT_5000_SPRITE_PATH: 'img/obstacle_yellow_right_5000.png',
        YELLOW_RIGHT_5000_MIN_DISTANCE_METERS: 5000, // Disponible estrictamente a partir de los 5,000 metros
        YELLOW_RIGHT_5000_CHANCE: 0.35,              // ~35% de probabilidad para estructuras hacia la derecha a partir de 5000m
        YELLOW_LEFT_SPRITE_PATH: 'img/obstacle_yellow_left.png',
        YELLOW_LEFT_SPRITE_PATHS: [
            'img/obstacle_yellow_left.png',
            'img/obstacle_yellow_left_2.png'
        ],
        BARRICADE_INTACT_SPRITE_PATH: 'img/barricade_intact.png',
        BARRICADE_DESTROYED_SPRITE_PATH: 'img/barricade_destroyed.png',
        CORPSE_PILE_INTACT_SPRITE_PATH: 'img/05.png',
        CORPSE_PILE_DESTROYED_SPRITE_PATH: 'img/06.png',
        BARRICADE_VARIANTS: [
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
        ]
    },

    // --- ESTÉTICA Y CÁMARA ---
    VISUALS: {
        FOV_NEAR_Z: -120,
        HORIZON_Z: 1450,
        SCREEN_SHAKE_DECAY: 13.0,
        ASCII_GLITCH_DENSITY: 28
    }
};

function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const STORAGE_KEY = 'PSR_CALIBRATED_CONFIG_V5';

const GameConfig = cloneDeep(DEFAULT_CONFIG);

GameConfig.loadSavedCalibration = function () {
    try {
        const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (saved.LANES) Object.assign(this.LANES, saved.LANES);
        if (saved.MOVEMENT) Object.assign(this.MOVEMENT, saved.MOVEMENT);
        if (saved.CONTROLS) Object.assign(this.CONTROLS, saved.CONTROLS);
        if (saved.OBSTACLES) Object.assign(this.OBSTACLES, saved.OBSTACLES);
        return true;
    } catch (e) {
        return false;
    }
};

GameConfig.saveCalibration = function () {
    try {
        if (!window.localStorage) return;
        const dataToSave = {
            LANES: { SWITCH_LERP_SPEED: this.LANES.SWITCH_LERP_SPEED },
            MOVEMENT: {
                MAX_RUN_SPEED: this.MOVEMENT.MAX_RUN_SPEED,
                ACCELERATION: this.MOVEMENT.ACCELERATION,
                MOMENTUM_GRACE_MS: this.MOVEMENT.MOMENTUM_GRACE_MS,
                GRACE_DECELERATION: this.MOVEMENT.GRACE_DECELERATION,
                STOP_DECELERATION: this.MOVEMENT.STOP_DECELERATION
            },
            CONTROLS: {
                TAP_MAX_DURATION_MS: this.CONTROLS.TAP_MAX_DURATION_MS,
                DOUBLE_TAP_WINDOW_MS: this.CONTROLS.DOUBLE_TAP_WINDOW_MS,
                B_INTERACTION_RANGE: this.CONTROLS.B_INTERACTION_RANGE
            },
            OBSTACLES: {
                LANE_TOLERANCE: this.OBSTACLES.LANE_TOLERANCE,
                TOPPLING_SPEED: this.OBSTACLES.TOPPLING_SPEED
            }
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) {}
};

GameConfig.resetToDefaults = function () {
    const fresh = cloneDeep(DEFAULT_CONFIG);
    Object.assign(this.LANES, fresh.LANES);
    Object.assign(this.MOVEMENT, fresh.MOVEMENT);
    Object.assign(this.BPM, fresh.BPM);
    Object.assign(this.CONTROLS, fresh.CONTROLS);
    Object.assign(this.MUSIC, fresh.MUSIC);
    Object.assign(this.DIFFICULTY, fresh.DIFFICULTY);
    Object.assign(this.PURSUIT, fresh.PURSUIT);
    Object.assign(this.OBSTACLES, fresh.OBSTACLES);
    Object.assign(this.VISUALS, fresh.VISUALS);
    try {
        if (window.localStorage) window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
};

GameConfig.loadSavedCalibration();

window.PSR.DEFAULT_CONFIG = DEFAULT_CONFIG;
window.PSR.GameConfig = GameConfig;
