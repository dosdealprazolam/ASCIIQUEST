/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Obstacle (Con Soporte de Masheo Múltiple)
 * ---------------------------------------------------------------------------------
 * Define obstáculos del escenario con soporte para interacción contextual (Control B)
 * y resistencia multicapa para exigir "button mashing" en niveles superiores.
 */
window.PSR = window.PSR || {};

const OBSTACLE_TYPES = {
    COLLAPSING_STRUCTURE: 'COLLAPSING_STRUCTURE',
    FRAGILE_BARRICADE: 'FRAGILE_BARRICADE',
    SOLID_MONOLITH: 'SOLID_MONOLITH'
};

class Obstacle {
    constructor({ id, type, lane, z, fallTargetLane = null, requiredHits = 1 }) {
        this.id = id;
        this.type = type;

        this.initialLane = lane;
        this.lane = lane;
        this.visualLane = lane;

        this.fallTargetLane = fallTargetLane;

        this.z = z;
        this.depth = 42;

        // Resistencia para masheo de B (1 golpe en Nivel 1, hasta 4 golpes rápidos en Nivel 5)
        this.requiredHits = Math.max(1, requiredHits);
        this.remainingHits = this.requiredHits;

        // Estados: 'ACTIVE' | 'TOPPLING' | 'COLLAPSED_IN_OTHER_LANE' | 'SHATTERED'
        this.state = 'ACTIVE';
        this.toppleProgress = 0;
        this.shatterProgress = 0;
        this.resistFlashTimer = 0;
        this.hitFlashTimer = 0;
        this.nearMissTriggered = false;
    }

    canInteractWithB() {
        if (this.state !== 'ACTIVE') return false;
        return (
            this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE ||
            this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE ||
            this.type === OBSTACLE_TYPES.SOLID_MONOLITH
        );
    }

    /**
     * Ejecuta un pulso de acción contextual B sobre el obstáculo.
     * Soporta masheo rápido cuando remainingHits > 1.
     */
    interactWithB() {
        if (this.type === OBSTACLE_TYPES.SOLID_MONOLITH && this.state === 'ACTIVE') {
            this.resistFlashTimer = 0.22;
            return 'RESISTED';
        }

        if (this.state !== 'ACTIVE') return 'NONE';

        this.remainingHits = Math.max(0, this.remainingHits - 1);
        this.hitFlashTimer = 0.14;

        // Si aún le quedan puntos de resistencia, registra impacto parcial para seguir masheando B
        if (this.remainingHits > 0) {
            return 'MASH_HIT';
        }

        if (this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE) {
            this.state = 'TOPPLING';
            this.toppleProgress = 0;
            this.lane = this.fallTargetLane;
            return 'MANIPULATED';
        }

        if (this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE) {
            this.state = 'SHATTERED';
            this.shatterProgress = 0;
            return 'SHATTERED';
        }

        return 'NONE';
    }

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
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
        }
    }
}

window.PSR.OBSTACLE_TYPES = OBSTACLE_TYPES;
window.PSR.Obstacle = Obstacle;
