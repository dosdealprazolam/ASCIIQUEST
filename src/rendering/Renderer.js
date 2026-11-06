/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Renderer (Fase 1)
 * -------------------------------------------------
 * Renderizador procedural 2.5D en HTML5 Canvas con estética oscura,
 * distorsión psicológica sutil, glifos ASCII ambientales y partículas de impacto.
 *
 * Respeta estrictamente la regla de diseño:
 * NUNCA muestra alertas de texto como "Ahora pulsa B" o "Pulsa A dos veces"
 * sobre los obstáculos. El jugador lee la física y silueta de cada estructura.
 */
window.PSR = window.PSR || {};

class Renderer {
    constructor(canvas, config, eventBus) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        this.eventBus = eventBus;

        this.width = 0;
        this.height = 0;
        this.shakeIntensity = 0;
        this.flashAlpha = 0;
        this.flashColor = '#ff2222';

        this.particles = [];
        this.asciiBackgroundNodes = [];

        this.heartImg = null;
        this.heartImgReady = false;
        this._initHeartImage();

        this._resize();
        window.addEventListener('resize', () => this._resize());
        this._initAsciiNightmareField();
        this._subscribeEvents();
    }

    _initHeartImage() {
        if (typeof Image === 'undefined') return;
        const img = new Image();
        const configuredPath = (this.config.BPM && this.config.BPM.HEART_ICON_PATH) || 'img/corazon.png';
        img.onload = () => {
            this.heartImgReady = true;
        };
        img.onerror = () => {
            if (img.src.indexOf('img/corazon.png') !== -1) {
                img.src = 'corazon.png';
            }
        };
        img.src = configuredPath;
        this.heartImg = img;
    }

    _resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    _initAsciiNightmareField() {
        const glyphs = ['░', '▒', '▓', '█', '†', '‡', '§', 'Ø', '∆', '◊', '¶', '#', '/', '\\', '|'];
        this.asciiBackgroundNodes = [];
        for (let i = 0; i < 48; i++) {
            this.asciiBackgroundNodes.push({
                side: i % 2 === 0 ? -1 : 1,
                offsetFactor: 1.25 + Math.random() * 1.8,
                z: Math.random() * this.config.VISUALS.HORIZON_Z,
                heightFactor: 0.4 + Math.random() * 1.4,
                glyph: glyphs[Math.floor(Math.random() * glyphs.length)]
            });
        }
    }

    _subscribeEvents() {
        this.eventBus.on('interaction:manipulated', ({ obstacle, toLane }) => {
            this.addShake(14);
            this._spawnImpactParticles(obstacle.initialLane, obstacle.z, '#ff9f1c', 28, toLane - obstacle.initialLane);
        });

        this.eventBus.on('interaction:mash_hit', ({ obstacle }) => {
            this.addShake(7);
            this._spawnImpactParticles(obstacle.lane, obstacle.z, '#ffbf69', 14, 0);
        });

        this.eventBus.on('difficulty:level_up', () => {
            this.addShake(12);
            this.flashColor = '#ff9f1c';
            this.flashAlpha = 0.28;
        });

        this.eventBus.on('interaction:shattered', ({ obstacle }) => {
            this.addShake(10);
            this._spawnImpactParticles(obstacle.lane, obstacle.z, '#e71d36', 24, 0);
        });

        this.eventBus.on('player:barricade_trauma', ({ obstacle }) => {
            this.addShake(18);
            this.flashColor = '#ff2a4b';
            this.flashAlpha = 0.38;
            this._spawnImpactParticles(obstacle.lane, obstacle.z, '#ff5964', 28, 0);
        });

        this.eventBus.on('interaction:resisted', ({ obstacle }) => {
            this.addShake(7);
            this._spawnImpactParticles(obstacle.lane, obstacle.z, '#ffffff', 14, 0);
        });

        this.eventBus.on('player:died', () => {
            this.addShake(26);
            this.flashColor = '#b8001f';
            this.flashAlpha = 0.65;
        });

        this.eventBus.on('sandbox:collision_impact', () => {
            this.addShake(16);
            this.flashColor = '#ff1e38';
            this.flashAlpha = 0.42;
        });

        this.eventBus.on('collision:survived_obstacle', () => {
            this.addShake(3.5);
        });
    }

    addShake(amount) {
        this.shakeIntensity = Math.min(30, this.shakeIntensity + amount);
    }

    _spawnImpactParticles(lane, worldZ, color, count, lateralBias = 0) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                lane: lane + (Math.random() - 0.5) * 0.35,
                z: worldZ + (Math.random() - 0.5) * 20,
                yOffset: Math.random() * 90,
                vLane: (Math.random() - 0.5) * 2.2 + lateralBias * (1.5 + Math.random() * 2.0),
                vY: (Math.random() - 0.3) * 180,
                life: 0.35 + Math.random() * 0.35,
                maxLife: 0.7,
                color,
                char: Math.random() < 0.5 ? '▓' : '▪'
            });
        }
    }

    /**
     * Proyecta coordenadas del mundo (lane ∈ [0..2], relZ) a coordenadas de pantalla 2.5D.
     */
    project(laneFloat, relZ, player) {
        const horizonY = this.height * 0.30;
        const playerScreenY = this.height * 0.85;
        const maxZ = this.config.VISUALS.HORIZON_Z;

        // Factor de profundidad no lineal; permite Z negativo para que la pista continúe hasta el borde inferior
        const clampedZ = Math.max(-130, relZ);
        const normZ = Math.min(1, Math.max(-0.10, clampedZ / maxZ));
        const perspective = 1 / (1 + normZ * 4.5);

        const y = horizonY + (playerScreenY - horizonY) * perspective;

        // Deformación sutil del escenario cuando la persecución se acerca o a alta velocidad
        const anxietyFactor = Math.max(0, 1 - player.pursuitDistance / this.config.PURSUIT.INITIAL_DISTANCE);
        const warpX = Math.sin(relZ * 0.004 + player.z * 0.005) * (8 + anxietyFactor * 26) * (1 - perspective);

        const trackWidthAtPlayer = Math.min(this.width * 0.68, 660);
        const currentTrackWidth = trackWidthAtPlayer * perspective;
        const laneWidth = currentTrackWidth / 3;

        // Convertimos lane (0, 1, 2) a (-1, 0, +1) respecto al centro
        const centeredLane = laneFloat - 1.0;
        const centerX = this.width * 0.5 + warpX;
        const x = centerX + centeredLane * laneWidth;

        return {
            x,
            y,
            scale: perspective,
            laneWidth,
            trackWidth: currentTrackWidth,
            centerX
        };
    }

    render(dt, now, state) {
        const { player, obstacles, inputState } = state;
        const ctx = this.ctx;

        // Decaimiento de screen shake y flashes
        if (this.shakeIntensity > 0) {
            this.shakeIntensity = Math.max(0, this.shakeIntensity - this.config.VISUALS.SCREEN_SHAKE_DECAY * dt * 3.2);
        }
        if (this.flashAlpha > 0) {
            this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.8);
        }

        ctx.save();

        // Aplicar vibración de cámara
        if (this.shakeIntensity > 0.2) {
            const sx = (Math.random() - 0.5) * this.shakeIntensity * 2;
            const sy = (Math.random() - 0.5) * this.shakeIntensity * 2;
            ctx.translate(sx, sy);
        }

        // 1. Fondo abismal y horizonte opresivo
        this._drawNightmareBackground(ctx, player, now);

        // 2. Carretera de 3 carriles y guías de profundidad
        this._drawTrackAndLanes(ctx, player);

        // 3. Estructuras laterales ASCII que respiran / pasan a toda velocidad
        this._drawAsciiRoadside(ctx, dt, player, now);

        // 4. Zona de alcance contextual B en el suelo (sutil y diegética)
        this._drawContextualReachZone(ctx, player);

        // 5. Obstáculos ordenados de más lejano a más cercano (Algoritmo del Pintor)
        const sortedObstacles = [...obstacles].sort((a, b) => b.z - a.z);
        for (const obs of sortedObstacles) {
            const relZ = obs.z - player.z;
            if (relZ > -120 && relZ <= this.config.VISUALS.HORIZON_Z) {
                this._drawObstacle(ctx, obs, relZ, player, now);
            }
        }

        // 6. El Corredor (Jugador)
        this._drawPlayer(ctx, player, inputState, now);

        // 7. Partículas de impacto/derrumbe
        this._updateAndDrawParticles(ctx, dt, player);

        // 8. Sombra de persecución ("Lo que viene detrás") y viñeta de ansiedad
        this._drawPursuitVignette(ctx, player, now);

        // 9. Flash de impacto/muerte
        if (this.flashAlpha > 0) {
            ctx.fillStyle = this.flashColor;
            ctx.globalAlpha = this.flashAlpha;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();
    }

    _drawNightmareBackground(ctx, player, now) {
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, '#040406');
        grad.addColorStop(0.30, '#0b090e');
        grad.addColorStop(1, '#050507');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);

        // Sol negro / Grieta en el horizonte
        const horizonY = this.height * 0.30;
        const pulse = Math.sin(now * 0.004) * 6;
        const radial = ctx.createRadialGradient(
            this.width * 0.5, horizonY, 5,
            this.width * 0.5, horizonY, 170 + pulse
        );
        radial.addColorStop(0, 'rgba(180, 18, 38, 0.22)');
        radial.addColorStop(0.5, 'rgba(70, 10, 20, 0.08)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, this.width, this.height * 0.55);
    }

    _drawTrackAndLanes(ctx, player) {
        const nearProj = this.project(1, -120, player);
        const farProj = this.project(1, this.config.VISUALS.HORIZON_Z, player);

        // Superficie del asfalto fracturado (continúa hasta el borde inferior de la pantalla)
        ctx.fillStyle = '#0d0d12';
        ctx.beginPath();
        ctx.moveTo(farProj.centerX - farProj.trackWidth * 0.5, farProj.y);
        ctx.lineTo(farProj.centerX + farProj.trackWidth * 0.5, farProj.y);
        ctx.lineTo(nearProj.centerX + nearProj.trackWidth * 0.5, nearProj.y);
        ctx.lineTo(nearProj.centerX - nearProj.trackWidth * 0.5, nearProj.y);
        ctx.closePath();
        ctx.fill();

        // Líneas de velocidad transversales para transmitir el frenetismo de la carrera
        const stepZ = 90;
        const offsetZ = stepZ - (player.z % stepZ) - stepZ * 2;
        for (let z = offsetZ; z < this.config.VISUALS.HORIZON_Z; z += stepZ) {
            if (z < -120) continue;
            const p = this.project(1, z, player);
            const alpha = Math.min(0.32, p.scale * 0.38);
            ctx.strokeStyle = `rgba(120, 120, 145, ${alpha})`;
            ctx.lineWidth = Math.max(1, 2 * p.scale);
            ctx.beginPath();
            ctx.moveTo(p.centerX - p.trackWidth * 0.5, p.y);
            ctx.lineTo(p.centerX + p.trackWidth * 0.5, p.y);
            ctx.stroke();
        }

        // Bordes exteriores y divisores de los 3 carriles
        const dividers = [-1.5, -0.5, 0.5, 1.5];
        for (let i = 0; i < dividers.length; i++) {
            const isOuter = (i === 0 || i === dividers.length - 1);
            ctx.strokeStyle = isOuter ? 'rgba(210, 35, 55, 0.55)' : 'rgba(160, 165, 185, 0.18)';
            ctx.lineWidth = isOuter ? 2.5 : 1.2;

            ctx.beginPath();
            for (let z = -120; z <= this.config.VISUALS.HORIZON_Z; z += 85) {
                const p = this.project(1 + dividers[i], z, player);
                if (z === -120) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
    }

    _drawAsciiRoadside(ctx, dt, player, now) {
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';

        for (const node of this.asciiBackgroundNodes) {
            let relZ = (node.z - (player.z % this.config.VISUALS.HORIZON_Z));
            if (relZ < -120) relZ += this.config.VISUALS.HORIZON_Z;

            const lanePos = 1 + node.side * node.offsetFactor;
            const p = this.project(lanePos, relZ, player);
            const pillarH = 190 * node.heightFactor * p.scale;
            const pillarW = 24 * p.scale;

            if (pillarH < 4) continue;

            // Silueta de edificio/estructura deformada al borde del camino
            const bend = Math.sin(now * 0.002 + node.z) * 14 * p.scale * node.side;
            ctx.fillStyle = `rgba(18, 16, 24, ${Math.min(0.85, p.scale * 1.4)})`;
            ctx.beginPath();
            ctx.moveTo(p.x - pillarW * 0.5, p.y);
            ctx.lineTo(p.x + pillarW * 0.5, p.y);
            ctx.lineTo(p.x + pillarW * 0.4 + bend, p.y - pillarH);
            ctx.lineTo(p.x - pillarW * 0.4 + bend, p.y - pillarH);
            ctx.closePath();
            ctx.fill();

            // Glifo ASCII de pesadilla incrustado
            if (p.scale > 0.22) {
                ctx.fillStyle = `rgba(195, 40, 60, ${Math.min(0.45, p.scale * 0.6)})`;
                ctx.fillText(node.glyph, p.x + bend * 0.5, p.y - pillarH * 0.5);
            }
        }
    }

    _drawContextualReachZone(ctx, player) {
        const nearP = this.project(player.visualLane, 10, player);
        const farP = this.project(player.visualLane, this.config.CONTROLS.B_INTERACTION_RANGE, player);

        const isUsingB = player.bActionTimer > 0;
        const alpha = isUsingB ? 0.35 : 0.09;
        ctx.strokeStyle = isUsingB ? `rgba(255, 165, 35, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = isUsingB ? 2.5 : 1;

        ctx.beginPath();
        ctx.moveTo(nearP.x - nearP.laneWidth * 0.38, nearP.y);
        ctx.lineTo(farP.x - farP.laneWidth * 0.38, farP.y);
        ctx.lineTo(farP.x + farP.laneWidth * 0.38, farP.y);
        ctx.lineTo(nearP.x + nearP.laneWidth * 0.38, nearP.y);
        ctx.closePath();
        ctx.stroke();
    }

    _drawObstacle(ctx, obs, relZ, player, now) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const effectiveLane = obs.state === 'ACTIVE' ? obs.lane : obs.visualLane;
        const p = this.project(effectiveLane, relZ, player);

        const w = p.laneWidth * 0.78;

        ctx.save();
        ctx.translate(p.x, p.y);

        if (obs.type === TYPES.COLLAPSING_STRUCTURE || obs.type === TYPES.TENTATIVE_HEAVY_TOWER) {
            // --- ESTRUCTURA ENORME MANIPULABLE CON B ---
            const h = 225 * p.scale;
            const tiltDir = obs.fallTargetLane > obs.initialLane ? 1 : -1;

            // Si está cayendo hacia el otro carril, rotamos la torre físicamente
            let angle = tiltDir * 0.07; // Leve inclinación natural que sugiere hacia dónde caerá
            if (obs.state === 'TOPPLING') {
                angle = tiltDir * (0.07 + obs.toppleProgress * 1.32);
            } else if (obs.state === 'COLLAPSED_IN_OTHER_LANE') {
                angle = tiltDir * 1.42;
            }

            ctx.rotate(angle);

            // Cuerpo de la torre industrial fracturada
            const isHitFlash = obs.hitFlashTimer > 0;
            ctx.fillStyle = isHitFlash ? '#5a3e1b' : (obs.state === 'ACTIVE' ? '#1e1922' : '#2a1818');
            ctx.strokeStyle = isHitFlash ? '#ffffff' : (obs.state === 'ACTIVE' ? '#ff9f1c' : '#ff4040');
            ctx.lineWidth = Math.max(1.5, 2.8 * p.scale);

            ctx.fillRect(-w * 0.44, -h, w * 0.88, h);
            ctx.strokeRect(-w * 0.44, -h, w * 0.88, h);

            // Grietas estructurales y tensores hacia el lado de derrumbe (lenguaje visual sin texto)
            ctx.strokeStyle = 'rgba(255, 159, 28, 0.85)';
            ctx.beginPath();
            ctx.moveTo(-w * 0.35 * tiltDir, -h * 0.25);
            ctx.lineTo(w * 0.42 * tiltDir, -h * 0.55);
            ctx.lineTo(w * 0.20 * tiltDir, -h * 0.82);
            ctx.stroke();

            // Símbolos ASCII estructurales y capas de resistencia al masheo
            if (p.scale > 0.25) {
                ctx.fillStyle = isHitFlash ? '#ffffff' : '#ff9f1c';
                ctx.font = `bold ${Math.max(10, Math.floor(20 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                const arrowGlyph = tiltDir > 0 ? '>>>' : '<<<';
                ctx.fillText(arrowGlyph, 0, -h * 0.48);
                const pips = '■'.repeat(Math.max(1, obs.remainingHits || 1));
                ctx.fillText(`[${pips}]`, 0, -h * 0.22);
            }
        } else if (obs.type === TYPES.SOLID_MONOLITH) {
            // --- MONOLITO INDESTRUCTIBLE (Obliga a esquivar con A) ---
            const h = 155 * p.scale;
            const isFlashing = obs.resistFlashTimer > 0;

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
        } else if (obs.type === TYPES.FRAGILE_BARRICADE) {
            // --- BARRICADA FRÁGIL DE ESCOMBROS (Rompible con B) ---
            if (obs.state === 'SHATTERED') {
                ctx.restore();
                return;
            }
            const h = (85 + ((obs.requiredHits || 1) - 1) * 18) * p.scale;
            const jitter = Math.sin(now * 0.03 + obs.id) * 2 * p.scale;
            const isHitFlash = obs.hitFlashTimer > 0;

            ctx.fillStyle = isHitFlash ? '#6b202e' : '#251419';
            ctx.strokeStyle = isHitFlash ? '#ffffff' : '#ff5964';
            ctx.lineWidth = Math.max(1.2, 2.2 * p.scale);

            ctx.beginPath();
            ctx.moveTo(-w * 0.48, 0);
            ctx.lineTo(-w * 0.35 + jitter, -h);
            ctx.lineTo(0, -h * 0.72);
            ctx.lineTo(w * 0.38 - jitter, -h * 0.95);
            ctx.lineTo(w * 0.48, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            if (p.scale > 0.25) {
                ctx.fillStyle = isHitFlash ? '#ffffff' : '#ff5964';
                ctx.font = `bold ${Math.max(10, Math.floor(18 * p.scale))}px monospace`;
                ctx.textAlign = 'center';
                const pips = '╬'.repeat(Math.max(1, obs.remainingHits || 1));
                ctx.fillText(pips, 0, -h * 0.35);
            }
        }

        ctx.restore();
    }

    _drawPlayer(ctx, player, inputState, now) {
        const p = this.project(player.visualLane, 0, player);

        // Balanceo físico de carrera
        const speedRatio = player.speed / this.config.MOVEMENT.MAX_RUN_SPEED;
        const bobY = Math.abs(Math.sin(player.stridePhase)) * 10 * speedRatio;
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
            const progress = 1 - (player.bActionTimer / (this.config.CONTROLS.B_ACTION_DURATION_MS / 1000));
            const radius = 34 + progress * 65;
            ctx.strokeStyle = `rgba(255, 165, 35, ${1 - progress})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, -45 - progress * 25, radius, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
        }

        // Silueta estilizada y oscura del Corredor
        const bodyH = 74;
        const bodyW = 30;

        // Aura tensa según si está corriendo con A o en ventana de cambio de carril
        ctx.strokeStyle = inputState.isHoldingA ? '#e2e8f0' : '#ff9f1c';
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

        // Cabeza
        ctx.beginPath();
        ctx.arc(0, -bodyH * 0.88, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Núcleo ASCII en la espalda del corredor
        ctx.fillStyle = inputState.isHoldingA ? '#ff2a4b' : '#ff9f1c';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(player.bActionTimer > 0 ? '⚡' : '◊', 0, -bodyH * 0.38);

        // Guía visual diegética de BPM junto al corredor con icono corazon.png
        const bpm = player.bpm || 110;
        const anchor = player.baseBpmAnchor || 110;
        const strikeBoost = Math.round(player.bpmStrikeBoost || 0);
        const isDeceleratingBpm = player.hasStartedRunning && anchor < 180 && player.cardiacExertion > 0.35;
        const endsInNine = (bpm % 10 === 9);
        const pulseScale = 1 + Math.max(0, Math.sin(player.heartPulsePhase || 0)) * 0.14;

        ctx.save();
        ctx.translate(bodyW * 1.15, -bodyH * 0.58);
        ctx.scale(pulseScale, pulseScale);
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = !player.hasStartedRunning
            ? '#94a3b8'
            : (strikeBoost > 0
                ? '#ffbf69'
                : (isDeceleratingBpm ? (endsInNine ? '#ff9f1c' : '#38bdf8') : '#ff2a4b'));
        if (this.heartImgReady && this.heartImg && ctx.drawImage) {
            ctx.drawImage(this.heartImg, 0, -11, 13, 13);
            ctx.fillText(`${bpm}`, 16, 0);
        } else {
            ctx.fillText(`♥ ${bpm}`, 0, 0);
        }
        ctx.restore();

        ctx.restore();
    }

    _updateAndDrawParticles(ctx, dt, player) {
        ctx.textAlign = 'center';
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.life -= dt;
            if (pt.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            pt.lane += pt.vLane * dt;
            pt.yOffset += pt.vY * dt;
            pt.vY -= 420 * dt; // Gravedad

            const relZ = pt.z - player.z;
            if (relZ < -80) continue;

            const proj = this.project(pt.lane, relZ, player);
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
            ctx.font = `bold ${Math.max(9, Math.floor(18 * proj.scale))}px monospace`;
            ctx.fillText(pt.char, proj.x, proj.y - pt.yOffset * proj.scale);
        }
        ctx.globalAlpha = 1.0;
    }

    _drawPursuitVignette(ctx, player, now) {
        const threat = Math.max(0, 1 - (player.pursuitDistance / this.config.PURSUIT.INITIAL_DISTANCE));
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

        // Si el corredor suelta A y se frena, la oscuridad detrás asciende desde el borde inferior
        if (threat > 0.25) {
            const creepH = this.height * 0.35 * threat;
            const bottomGrad = ctx.createLinearGradient(0, this.height, 0, this.height - creepH);
            bottomGrad.addColorStop(0, `rgba(180, 10, 30, ${0.55 * threat})`);
            bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = bottomGrad;
            ctx.fillRect(0, this.height - creepH, this.width, creepH);
        }
    }
}

window.PSR.Renderer = Renderer;
