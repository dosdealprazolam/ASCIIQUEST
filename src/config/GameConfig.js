/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Configuración Global (Fase 1 + Calibración)
 * ---------------------------------------------------------------------------
 * Todos los parámetros clave de jugabilidad, tiempos de respuesta,
 * velocidades, carriles y obstáculos están centralizados aquí.
 * Soporta persistencia en vivo desde el Nivel Sandbox de Calibración.
 */
window.PSR = window.PSR || {};

const DEFAULT_CONFIG = {
    // --- CONFIGURACIÓN DE CARRILES ---
    LANES: {
        COUNT: 3,
        NAMES: ['CARRIL 1 (IZQ)', 'CARRIL 2 (CENTRO)', 'CARRIL 3 (DER)'],
        DEFAULT_LANE: 1,              // Empieza en el carril central (0, 1, 2)
        SWITCH_LERP_SPEED: 16.0       // Velocidad de interpolación visual al cambiar de carril
    },

    // --- FÍSICA DE CARRERA (CONTROL A) ---
    MOVEMENT: {
        MAX_RUN_SPEED: 720,           // Velocidad máxima manteniendo A (unidades/seg)
        ACCELERATION: 2600,           // Aceleración al mantener A
        MOMENTUM_GRACE_MS: 420,       // Ventana de inercia al soltar A para cambiar de carril sin frenar en seco
        GRACE_DECELERATION: 320,      // Desaceleración suave durante la ventana de cambio de carril
        STOP_DECELERATION: 1500,      // Desaceleración fuerte si el jugador suelta A y deja de correr
        MIN_SPEED_THRESHOLD: 5
    },

    // --- TIEMPOS DE RESPUESTA DEL CONTROL A Y B ---
    CONTROLS: {
        TAP_MAX_DURATION_MS: 230,     // Duración máxima (ms) entre presionar y soltar A para considerarse un "toque"
        DOUBLE_TAP_WINDOW_MS: 320,    // Tiempo máximo (ms) entre el primer y segundo toque de A
        B_ACTION_DURATION_MS: 220,    // Duración activa del impulso/empuje contextual con B
        B_INTERACTION_RANGE: 190,     // Distancia frontal máxima en la que B puede manipular un obstáculo
        B_MIN_RANGE: -20              // Margen trasero de interacción justa
    },

    // --- PRESIÓN PSICOLÓGICA / PERSECUCIÓN ---
    PURSUIT: {
        INITIAL_DISTANCE: 100,        // Distancia inicial de "lo que viene detrás" (0 = te alcanza y mueres)
        RECOVERY_RATE: 14,            // Cuánto te alejas por segundo al correr a máxima velocidad
        APPROACH_RATE_WHEN_SLOW: 38,  // Qué tan rápido se acerca la amenaza cuando sueltas A demasiado tiempo
        DANGER_THRESHOLD: 40          // Umbral donde la distorsión visual y ansiedad se disparan
    },

    // --- GENERACIÓN Y DIMENSIONES DE OBSTÁCULOS (FASE 1) ---
    OBSTACLES: {
        SPAWN_DISTANCE: 1350,         // Distancia frontal a la que aparecen los obstáculos
        DESPAWN_DISTANCE: -180,       // Distancia detrás del jugador donde se eliminan
        BASE_SPAWN_INTERVAL_MS: 1350, // Intervalo base entre obstáculos (en ms a velocidad máxima)
        MIN_SPAWN_INTERVAL_MS: 750,   // Intervalo mínimo para mantener tensión sin bloqueos imposibles
        PLAYER_HITBOX_DEPTH: 34,      // Profundidad de colisión del jugador
        LANE_TOLERANCE: 0.36,         // Margen lateral de colisión entre carriles (0.0 a 1.0)
        TOPPLING_SPEED: 4.8           // Velocidad a la que una estructura empujada con B cae hacia otro carril
    },

    // --- ESTÉTICA Y CÁMARA ---
    VISUALS: {
        FOV_NEAR_Z: -120,
        HORIZON_Z: 1350,
        SCREEN_SHAKE_DECAY: 12.0,
        ASCII_GLITCH_DENSITY: 28
    }
};

function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const STORAGE_KEY = 'PSR_CALIBRATED_CONFIG_V1';

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
