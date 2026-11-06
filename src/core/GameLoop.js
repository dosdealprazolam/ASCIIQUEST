/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - GameLoop
 * ----------------------------------------
 * Gestiona el ciclo de actualización y renderizado con Delta Time (dt)
 * acotado para garantizar físicas deterministas y fluidas a cualquier tasa de refresco.
 */
window.PSR = window.PSR || {};

class GameLoop {
    constructor(updateFn, renderFn) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;

        this.isRunning = false;
        this.lastFrameTime = 0;
        this.rafId = null;

        // Límite máximo de delta time (50ms = 20 FPS mín) para evitar saltos tras pausas
        this.maxDeltaSeconds = 0.05;

        this._tick = this._tick.bind(this);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.rafId = requestAnimationFrame(this._tick);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    _tick(now) {
        if (!this.isRunning) return;

        const rawDelta = (now - this.lastFrameTime) / 1000;
        const dt = Math.min(Math.max(rawDelta, 0.001), this.maxDeltaSeconds);
        this.lastFrameTime = now;

        this.updateFn(dt, now);
        this.renderFn(dt, now);

        this.rafId = requestAnimationFrame(this._tick);
    }
}

window.PSR.GameLoop = GameLoop;
