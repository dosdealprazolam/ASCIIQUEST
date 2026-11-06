/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Configuración Global (Calibrada + 5 Niveles)
 * ----------------------------------------------------------------------------
 * Incorpora como valores base los ajustes calibrados por el usuario en el Sandbox
 * y define la progresión de 5 niveles de intensidad cada 1000 metros.
 */
window.PSR = window.PSR || {};

const DEFAULT_CONFIG = {
    // --- CONFIGURACIÓN DE CARRILES ---
    LANES: {
        COUNT: 3,
        NAMES: ['CARRIL 1 (IZQ)', 'CARRIL 2 (CENTRO)', 'CARRIL 3 (DER)'],
        DEFAULT_LANE: 1,              // Empieza en el carril central (0, 1, 2)
        SWITCH_LERP_SPEED: 21.0       // Calibrado por el usuario (21)
    },

    // --- FÍSICA DE CARRERA (CONTROL A) ---
    MOVEMENT: {
        MAX_RUN_SPEED: 860,           // Calibrado por el usuario (860 u/s)
        ACCELERATION: 3100,           // Calibrado por el usuario (3100 u/s²)
        MOMENTUM_GRACE_MS: 420,       // Calibrado por el usuario (420 ms)
        GRACE_DECELERATION: 320,      // Desaceleración suave durante la ventana de cambio de carril
        STOP_DECELERATION: 1500,      // Calibrado por el usuario (1500 u/s²)
        MIN_SPEED_THRESHOLD: 5
    },

    // --- TIEMPOS DE RESPUESTA Y SENSIBILIDAD DE GATILLOS (CONTROL A Y B) ---
    CONTROLS: {
        TAP_MAX_DURATION_MS: 260,     // Calibrado por el usuario (260 ms)
        DOUBLE_TAP_WINDOW_MS: 500,    // Calibrado por el usuario (500 ms)
        B_ACTION_DURATION_MS: 150,    // Pulso visual corto para permitir mashing frenético de B
        B_INTERACTION_RANGE: 260,     // Alcance amplio para poder mashear B múltiples veces a alta velocidad
        B_MIN_RANGE: -25,             // Margen trasero justo
        TRIGGER_THRESHOLD: 0.12,      // Gatillos ultra sensibles (se activan con solo 12% de recorrido)
        TRIGGER_RAPID_DELTA: 0.06     // Rapid-Trigger: basta soltar 6% el gatillo para poder volver a pulsar
    },

    // --- PROGRESIÓN DE DIFICULTAD: 5 NIVELES (CADA 1000 METROS) ---
    DIFFICULTY: {
        METERS_PER_LEVEL: 1000,
        MAX_LEVEL: 5,
        LEVELS: [
            {
                level: 1,
                name: 'NIVEL 1 — FALSO CONTROL',
                subtitle: 'Solo obstáculos rompibles/manipulables de a pocos',
                speedMultiplier: 1.00,
                spawnSpacing: 520,
                doubleLaneChance: 0.0,    // De a pocos (1 solo carril a la vez)
                monolithChance: 0.0,      // 0% indestructibles: TODO se puede romper o empujar con B
                collapsingChance: 0.35,   // 35% torres empujables, 65% barricadas rompibles
                minHits: 1,
                maxHits: 1
            },
            {
                level: 2,
                name: 'NIVEL 2 — TENSIÓN DE IMPACTO',
                subtitle: 'Estructuras resistentes (Mashea B) + Mayor ritmo',
                speedMultiplier: 1.08,
                spawnSpacing: 450,
                doubleLaneChance: 0.18,
                monolithChance: 0.0,      // Siguen siendo rompibles/empujables pero exigen mashear B
                collapsingChance: 0.45,
                minHits: 1,
                maxHits: 2
            },
            {
                level: 3,
                name: 'NIVEL 3 — RUPTURA',
                subtitle: 'Aparecen Monolitos indestructibles + Masheo intenso',
                speedMultiplier: 1.16,
                spawnSpacing: 390,
                doubleLaneChance: 0.35,
                monolithChance: 0.28,     // Ahora no todo cede ante B: obliga a combinar A y B
                collapsingChance: 0.40,
                minHits: 2,
                maxHits: 3
            },
            {
                level: 4,
                name: 'NIVEL 4 — FRENESÍ',
                subtitle: 'Formaciones dobles frecuentes + Ráfagas de B',
                speedMultiplier: 1.25,
                spawnSpacing: 340,
                doubleLaneChance: 0.55,
                monolithChance: 0.35,
                collapsingChance: 0.38,
                minHits: 2,
                maxHits: 3
            },
            {
                level: 5,
                name: 'NIVEL 5 — PESADILLA TOTAL',
                subtitle: 'Velocidad crítica + Muros de masheo extremo',
                speedMultiplier: 1.36,
                spawnSpacing: 295,
                doubleLaneChance: 0.72,
                monolithChance: 0.38,
                collapsingChance: 0.36,
                minHits: 3,
                maxHits: 4
            }
        ]
    },

    // --- PRESIÓN PSICOLÓGICA / PERSECUCIÓN ---
    PURSUIT: {
        INITIAL_DISTANCE: 100,
        RECOVERY_RATE: 15,
        APPROACH_RATE_WHEN_SLOW: 38,
        DANGER_THRESHOLD: 40
    },

    // --- GENERACIÓN Y DIMENSIONES DE OBSTÁCULOS ---
    OBSTACLES: {
        SPAWN_DISTANCE: 1450,
        DESPAWN_DISTANCE: -180,
        PLAYER_HITBOX_DEPTH: 34,
        LANE_TOLERANCE: 0.36,
        TOPPLING_SPEED: 5.4
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

// Nueva versión de clave para aplicar los valores de la captura del usuario inmediatamente
const STORAGE_KEY = 'PSR_CALIBRATED_CONFIG_V3';

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
    Object.assign(this.CONTROLS, fresh.CONTROLS);
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
