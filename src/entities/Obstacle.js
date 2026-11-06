/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Obstacle
 * ------------------------------------------------
 * Define obstáculos del escenario con soporte para interacción contextual (Control B).
 *
 * Tipos implementados en el prototipo (Fase 1):
 *  1. COLLAPSING_STRUCTURE: Estructura alta e inestable que bloquea el carril.
 *     Al usar [B] cerca, el jugador la empuja y se derrumba hacia un carril adyacente,
 *     liberando el paso actual pero bloqueando el carril contiguo.
 *  2. FRAGILE_BARRICADE: Barricada de escombros que puede apartarse/romperse con [B]
 *     o esquivarse cambiando de carril con [A].
 *  3. SOLID_MONOLITH: Masa de hormigón/acero indestructible. [B] no puede moverla;
 *     obliga al jugador a cambiar de carril con [A].
 */
window.PSR = window.PSR || {};

const OBSTACLE_TYPES = {
    COLLAPSING_STRUCTURE: 'COLLAPSING_STRUCTURE',
    FRAGILE_BARRICADE: 'FRAGILE_BARRICADE',
    SOLID_MONOLITH: 'SOLID_MONOLITH'
};

class Obstacle {
    constructor({ id, type, lane, z, fallTargetLane = null }) {
        this.id = id;
        this.type = type;

        // Carril lógico actual y carril visual interpolado (para estructuras que se derrumban a otro carril)
        this.initialLane = lane;
        this.lane = lane;
        this.visualLane = lane;

        // Si es una estructura empujable con B, hacia qué carril adyacente se derrumbará
        this.fallTargetLane = fallTargetLane;

        // Posición longitudinal en el mundo (z) y dimensiones
        this.z = z;
        this.depth = 42;

        // Estados: 'ACTIVE' | 'TOPPLING' | 'COLLAPSED_IN_OTHER_LANE' | 'SHATTERED'
        this.state = 'ACTIVE';
        this.toppleProgress = 0;      // 0.0 -> 1.0 durante el derrumbe lateral
        this.shatterProgress = 0;     // 0.0 -> 1.0 al romperse
        this.resistFlashTimer = 0;    // Destello cuando el jugador intenta usar B en algo indestructible
        this.nearMissTriggered = false;
    }

    /**
     * Indica si este obstáculo puede ser manipulado contextualmente con B ahora mismo.
     */
    canInteractWithB() {
        if (this.state !== 'ACTIVE') return false;
        return (
            this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE ||
            this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE ||
            this.type === OBSTACLE_TYPES.SOLID_MONOLITH
        );
    }

    /**
     * Ejecuta la acción contextual B sobre el obstáculo.
     * @returns {string} Resultado de la interacción ('MANIPULATED' | 'SHATTERED' | 'RESISTED')
     */
    interactWithB() {
        if (this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE && this.state === 'ACTIVE') {
            this.state = 'TOPPLING';
            this.toppleProgress = 0;
            // El carril original queda libre de inmediato al iniciar el empuje;
            // la masa pasa a ocupar progresivamente el carril destino.
            this.lane = this.fallTargetLane;
            return 'MANIPULATED';
        }

        if (this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE && this.state === 'ACTIVE') {
            this.state = 'SHATTERED';
            this.shatterProgress = 0;
            return 'SHATTERED';
        }

        if (this.type === OBSTACLE_TYPES.SOLID_MONOLITH && this.state === 'ACTIVE') {
            this.resistFlashTimer = 0.25;
            return 'RESISTED';
        }

        return 'NONE';
    }

    /**
     * Indica si el obstáculo sigue siendo letal en colisión.
     */
    isLethal() {
        return this.state !== 'SHATTERED';
    }

    update(dt, config) {
        if (this.state === 'TOPPLING') {
            this.toppleProgress = Math.min(1, this.toppleProgress + config.OBSTACLES.TOPPLING_SPEED * dt);
            this.visualLane = this.initialLane + (this.fallTargetLane - this.initialLane) * this.toppleProgress;
            if (this.toppleProgress >= 1) {
                this.state = 'COLLAPSED_IN_OTHER_LANE';
                this.visualLane = this.fallTargetLane;
            }
        } else if (this.state === 'SHATTERED') {
            this.shatterProgress = Math.min(1, this.shatterProgress + 4.5 * dt);
        }

        if (this.resistFlashTimer > 0) {
            this.resistFlashTimer = Math.max(0, this.resistFlashTimer - dt);
        }
    }
}

window.PSR.OBSTACLE_TYPES = OBSTACLE_TYPES;
window.PSR.Obstacle = Obstacle;
