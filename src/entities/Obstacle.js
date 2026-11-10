/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Entidad Obstacle (Con Telemetría Dev + Derrumbe Fiable)
 * ---------------------------------------------------------------------------------------
 *  - COLLAPSING_STRUCTURE (muro amarillo que se tumba): se derrumba de forma inmediata
 *    y fluida al ser golpeado en rango con [B], evitando que se quede de pie por capas
 *    residuales cuando el jugador reacciona bien.
 *  - Incluye registro de telemetría (`debugHistory`) para el Sistema de Diagnóstico de Muerte.
 */
window.PSR = window.PSR || {};

const OBSTACLE_TYPES = {
    COLLAPSING_STRUCTURE: 'COLLAPSING_STRUCTURE',
    FRAGILE_BARRICADE: 'FRAGILE_BARRICADE',
    SOLID_MONOLITH: 'SOLID_MONOLITH',
    // Aislado para uso futuro (no aparece en las oleadas actuales)
    TENTATIVE_HEAVY_TOWER: 'TENTATIVE_HEAVY_TOWER'
};

class Obstacle {
    constructor({ id, type, lane, z, fallTargetLane = null, requiredHits = 1, isRareRightVariant = false, is5000RightVariant = false, spriteVariantIndex = null }) {
        this.id = id;
        this.type = type;

        this.initialLane = lane;
        this.lane = lane;
        this.visualLane = lane;

        this.fallTargetLane = fallTargetLane;

        this.z = z;
        this.depth = 42;

        // Variante especial de pilar caído a la derecha (>= 2000m)
        this.isRareRightVariant = !!isRareRightVariant;
        // Variante pesada en ruinas de pilar caído a la derecha (>= 5000m)
        this.is5000RightVariant = !!is5000RightVariant;

        // El muro amarillo (COLLAPSING_STRUCTURE) siempre responde al golpe certero en rango
        this.requiredHits = type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE
            ? 1
            : Math.max(1, requiredHits);
        this.remainingHits = this.requiredHits;
        this.hitsReceived = 0;

        // Estados: 'ACTIVE' | 'TOPPLING' | 'COLLAPSED_IN_OTHER_LANE' | 'SHATTERED'
        this.state = 'ACTIVE';
        this.toppleProgress = 0;
        this.shatterProgress = 0;
        this.resistFlashTimer = 0;
        this.hitFlashTimer = 0;
        this.nearMissTriggered = false;

        // Telemetría para el Sistema de Diagnóstico de Muerte (Dev Inspector)
        this.debugHistory = [];

        // Variante visual aleatoria o calibrada por pesos para alternar entre los modelos disponibles
        this.spriteVariantIndex = typeof spriteVariantIndex === 'number'
            ? spriteVariantIndex
            : Math.floor(Math.random() * 100);
    }

    canInteractWithB() {
        if (this.state !== 'ACTIVE') return false;
        return (
            this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE ||
            this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE ||
            this.type === OBSTACLE_TYPES.SOLID_MONOLITH ||
            this.type === OBSTACLE_TYPES.TENTATIVE_HEAVY_TOWER
        );
    }

    /**
     * Ejecuta la acción contextual B sobre el obstáculo y guarda telemetría para depuración.
     */
    interactWithB(relZ = 100, config = null) {
        if (this.type === OBSTACLE_TYPES.SOLID_MONOLITH && this.state === 'ACTIVE') {
            this.resistFlashTimer = 0.22;
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'RESISTED',
                note: 'Monolito indestructible resistió [B]'
            });
            return 'RESISTED';
        }

        if (this.state !== 'ACTIVE') {
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'ALREADY_' + this.state,
                note: `Obstáculo ya estaba en estado ${this.state}`
            });
            return 'NONE';
        }

        this.hitFlashTimer = 0.14;
        this.hitsReceived++;

        // --- CASO AISLADO: Futuro obstáculo tentativo (único con micro-empujones hacia atrás) ---
        if (this.type === OBSTACLE_TYPES.TENTATIVE_HEAVY_TOWER) {
            if (relZ <= 90) {
                this.remainingHits = 0;
            } else {
                this.remainingHits = Math.max(0, this.remainingHits - 1);
            }
            if (this.remainingHits > 0) {
                const knockback = (config && config.CONTROLS && config.CONTROLS.TENTATIVE_KNOCKBACK_Z) || 95;
                this.z += knockback;
                this.debugHistory.push({
                    relZ: Math.round(relZ),
                    outcome: 'MASH_HIT',
                    remainingHits: this.remainingHits
                });
                return 'MASH_HIT';
            }
            this.state = 'TOPPLING';
            this.toppleProgress = 0;
            this.lane = this.fallTargetLane;
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'MANIPULATED',
                toLane: this.fallTargetLane
            });
            return 'MANIPULATED';
        }

        // --- MURO AMARILLO (COLLAPSING_STRUCTURE): Siempre se tumba al golpearlo en rango ---
        if (this.type === OBSTACLE_TYPES.COLLAPSING_STRUCTURE) {
            this.remainingHits = 0;
            this.state = 'TOPPLING';
            this.toppleProgress = 0;
            this.lane = this.fallTargetLane;
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'MANIPULATED',
                note: `Muro amarillo tumbado hacia carril ${this.fallTargetLane + 1}`
            });
            return 'MANIPULATED';
        }

        // --- BARRICADA DE ESCOMBROS (FRAGILE_BARRICADE): Cada golpe resta exactamente 1 punto (2 golpes = 2 toques reales) ---
        this.remainingHits = Math.max(0, this.remainingHits - 1);

        if (this.remainingHits > 0) {
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'MASH_HIT',
                remainingHits: this.remainingHits,
                requiredHits: this.requiredHits
            });
            return 'MASH_HIT';
        }

        if (this.type === OBSTACLE_TYPES.FRAGILE_BARRICADE) {
            this.state = 'SHATTERED';
            this.shatterProgress = 0;
            this.debugHistory.push({
                relZ: Math.round(relZ),
                outcome: 'SHATTERED',
                requiredHits: this.requiredHits,
                note: `Barricada destruida tras ${this.hitsReceived}/${this.requiredHits} golpes`
            });
            return 'SHATTERED';
        }

        return 'NONE';
    }

    isLethal() {
        return this.state !== 'SHATTERED';
    }

    update(dt, config) {
        if (this.state === 'TOPPLING') {
            const speed = this.type === OBSTACLE_TYPES.TENTATIVE_HEAVY_TOWER
                ? (config.OBSTACLES.TENTATIVE_HEAVY_TOPPLING_SPEED || 3.8)
                : (config.OBSTACLES.TOPPLING_SPEED || 5.8);

            this.toppleProgress = Math.min(1, this.toppleProgress + speed * dt);
            this.visualLane = this.initialLane + (this.fallTargetLane - this.initialLane) * this.toppleProgress;
            if (this.toppleProgress >= 1) {
                this.state = 'COLLAPSED_IN_OTHER_LANE';
                this.visualLane = this.fallTargetLane;
            }
        } else if (this.state === 'SHATTERED') {
            this.shatterProgress = Math.min(1, this.shatterProgress + 2.8 * dt);
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
