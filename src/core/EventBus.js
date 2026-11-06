/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - EventBus (Arquitectura Desacoplada)
 * -------------------------------------------------------------------
 * Permite que los sistemas se comuniquen mediante eventos sin depender
 * directamente unos de otros (ej. InputManager emite eventos de control,
 * InteractionSystem emite eventos de derrumbe, CollisionSystem emite muerte).
 */
window.PSR = window.PSR || {};

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Suscribe una función a un evento específico.
     * @param {string} eventName - Nombre del evento.
     * @param {Function} callback - Función a ejecutar.
     * @returns {Function} Función para cancelar la suscripción.
     */
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        this.listeners.get(eventName).add(callback);

        return () => this.off(eventName, callback);
    }

    /**
     * Elimina una suscripción de un evento.
     */
    off(eventName, callback) {
        const set = this.listeners.get(eventName);
        if (set) {
            set.delete(callback);
        }
    }

    /**
     * Emite un evento con datos opcionales a todos los suscriptores.
     */
    emit(eventName, payload = {}) {
        const set = this.listeners.get(eventName);
        if (!set) return;
        for (const callback of set) {
            try {
                callback(payload);
            } catch (err) {
                console.error(`[EventBus] Error en listener de "${eventName}":`, err);
            }
        }
    }

    /**
     * Limpia todos los eventos registrados.
     */
    clear() {
        this.listeners.clear();
    }
}

window.PSR.EventBus = EventBus;
