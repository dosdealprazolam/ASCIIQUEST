/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - CollisionSystem (Con Diagnóstico Técnico de Muerte Dev)
 * ---------------------------------------------------------------------------------------
 * Evalúa colisiones letales y genera un informe técnico detallado (`diagnostics`)
 * para que el desarrollador distinga de inmediato si una muerte fue por Dinámica de Juego
 * o por un Bug / caso borde de input.
 */
window.PSR = window.PSR || {};

class CollisionSystem {
    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;
    }

    update(player, obstacles, interactionSystem = null) {
        if (!player.isAlive) return;

        const halfDepth = this.config.OBSTACLES.PLAYER_HITBOX_DEPTH * 0.5;
        const laneTolerance = this.config.OBSTACLES.LANE_TOLERANCE;

        for (const obs of obstacles) {
            if (!obs.isLethal()) continue;

            const relZ = obs.z - player.z;
            const zOverlap = Math.abs(relZ) <= (halfDepth + obs.depth * 0.38);

            if (zOverlap) {
                // Si la estructura fue empujada con [B] y está cayendo (TOPPLING),
                // el carril original ya quedó 100% libre y aún no termina de aplastar el carril destino
                if (obs.state === 'TOPPLING' && obs.toppleProgress < 0.78) {
                    continue;
                }

                // Una estructura derrumbada solo es letal en su carril de caída final (fallTargetLane)
                const effectiveObsLane = obs.state === 'ACTIVE' ? obs.lane : obs.fallTargetLane;
                const laneDist = Math.abs(player.visualLane - effectiveObsLane);

                if (laneDist <= laneTolerance) {
                    const TYPES = window.PSR.OBSTACLE_TYPES;

                    // --- NUEVA MECÁNICA DE BPM EN OBSTÁCULOS BÁSICOS (FRAGILE_BARRICADE) ---
                    // El 1er choque NO te mata: rompe la barricada con el cuerpo, te baja el BPM a la mitad
                    // y entra en recuperación lenta (12.5s). Si te vuelve a golpear otra antes de acabar,
                    // te baja 70 BPM y mueres si te quedas sin BPMs / acumulas los 2 impactos en ese lapso.
                    if (obs.type === TYPES.FRAGILE_BARRICADE) {
                        obs.state = 'SHATTERED';
                        obs.shatterProgress = 0;

                        const trauma = player.applyBarricadeTrauma();
                        if (trauma.survived) {
                            this.eventBus.emit('player:barricade_trauma', {
                                obstacle: obs,
                                previousBpm: trauma.previousBpm,
                                newBpm: trauma.newBpm,
                                recoverySeconds: trauma.recoverySeconds
                            });
                            continue;
                        }

                        // Segundo impacto dentro del lapso de 10-15s (-70 BPM -> muerte)
                        const { reason, detail, advice, diagnostics } = this._buildDeathDiagnosis(
                            obs,
                            player,
                            relZ,
                            interactionSystem,
                            trauma
                        );
                        player.die(reason, detail, diagnostics, advice);
                        if (!player.sandboxImmortal) return;
                        continue;
                    }

                    if (player.sandboxImmortal) {
                        if (!obs.sandboxHitTriggered) {
                            obs.sandboxHitTriggered = true;
                            const { reason, detail, advice, diagnostics } = this._buildDeathDiagnosis(obs, player, relZ, interactionSystem);
                            player.die(reason, detail, diagnostics, advice);
                        }
                        continue;
                    }
                    const { reason, detail, advice, diagnostics } = this._buildDeathDiagnosis(obs, player, relZ, interactionSystem);
                    player.die(reason, detail, diagnostics, advice);
                    return;
                }
            }

            if (!obs.nearMissTriggered && relZ < -halfDepth) {
                obs.nearMissTriggered = true;
                this.eventBus.emit('collision:survived_obstacle', {
                    obstacle: obs
                });
            }
        }
    }

    _buildDeathDiagnosis(obs, player, relZAtDeath, interactionSystem, traumaInfo = null) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const laneNames = this.config.LANES.NAMES;

        let reason = 'COLISIÓN MORTAL';
        let detail = 'No reaccionaste a tiempo ante el obstáculo.';
        let advice = '💡 CONSEJO: Mantén la vista adelantada y usa [A] para cambiar de carril o [B] para abrirte paso.';

        if (obs.type === TYPES.COLLAPSING_STRUCTURE || obs.type === TYPES.TENTATIVE_HEAVY_TOWER) {
            if (obs.state === 'ACTIVE') {
                reason = 'IMPACTO CONTRA ESTRUCTURA INESTABLE (MURO AMARILLO)';
                detail = `No tumbaste el muro amarillo a tiempo antes del choque.`;
                advice = `💡 CONSEJO: Cuando estés cerca del muro amarillo, pulsa [B] para tumbarlo hacia ${laneNames[obs.fallTargetLane]} o esquívalo cambiando de carril con [A].`;
            } else {
                reason = 'APLASTADO POR DERRUMBE PROVOCADO';
                detail = `Tumbaste el muro amarillo hacia ${laneNames[obs.fallTargetLane]} y te metiste en el carril donde cayó.`;
                advice = `💡 CONSEJO: Fíjate en las flechas (>>> o <<<) del muro amarillo: al golpearlo con [B] tu carril queda seguro, ¡no te cambies hacia el carril donde cae!`;
            }
        } else if (obs.type === TYPES.SOLID_MONOLITH) {
            reason = 'IMPACTO CONTRA MONOLITO INDESTRUCTIBLE';
            detail = 'Los bloques macizos rojos no se pueden romper ni empujar con [B].';
            advice = '💡 CONSEJO: Para esquivar un Monolito Sólido suelta [A], da 1 toque rápido (carril siguiente) o 2 toques rápidos (carril anterior) y vuelve a mantener [A].';
        } else if (obs.type === TYPES.FRAGILE_BARRICADE) {
            reason = 'IMPACTO CONTRA BARRICADA DE ESCOMBROS';
            detail = obs.requiredHits > 1
                ? `No lograste romper todas las capas de la barricada antes de chocar.`
                : 'Chocaste contra una barricada de escombros sin destruirla ni esquivarla.';
            advice = obs.requiredHits > 1
                ? `💡 CONSEJO: Las barricadas con varios símbolos (╬╬) requieren mashear [B] ${obs.requiredHits} veces rápidas seguidas al acercarte.`
                : '💡 CONSEJO: Pulsa [B] justo antes de chocar contra los escombros para destrozarlos o esquívalos con [A].';
        }

        const diagnostics = this._analyzeTechnicalCause(obs, player, relZAtDeath, interactionSystem, traumaInfo);
        return { reason, detail, advice, diagnostics };
    }

    /**
     * Analiza la bitácora de inputs y el estado del obstáculo para distinguir Dinámica vs. Bug.
     */
    _analyzeTechnicalCause(obs, player, relZAtDeath, interactionSystem, traumaInfo = null) {
        const TYPES = window.PSR.OBSTACLE_TYPES;
        const laneNames = this.config.LANES.NAMES;
        const recentB = (interactionSystem && interactionSystem.recentBAttempts) ? interactionSystem.recentBAttempts : [];
        const effRange = interactionSystem ? interactionSystem.getEffectiveRange(player) : 210;

        // Buscar si hubo algún intento de [B] reciente (en los últimos 1400ms o 900 unidades Z)
        const now = performance.now();
        const recentAttemptForThisObs = recentB.find(a => a.targetObsId === obs.id && (now - a.timeMs) < 1600);
        const latestAttempt = recentB.length > 0 && (now - recentB[0].timeMs) < 1500 ? recentB[0] : null;

        let verdict = 'DINÁMICA DE JUEGO';
        let isBugSuspect = false;
        let explanation = '';

        if (traumaInfo) {
            verdict = `DINÁMICA DE TRAUMA BPM (GOLPE #${traumaInfo.hitCountInWindow} | -70 BPM -> 0 BPM)`;
            explanation = `Chocaste contra la Barricada #${obs.id} y cada golpe resta 70 BPM (${traumaInfo.previousBpm} → ${traumaInfo.newBpm} BPM), quedándote sin pulso vital.`;
        } else if (obs.type === TYPES.SOLID_MONOLITH) {
            if (recentAttemptForThisObs) {
                verdict = 'DINÁMICA DE JUEGO (GOLPEASTE MONOLITO SÓLIDO)';
                explanation = `Pulsaste [B] a relZ=${recentAttemptForThisObs.relZAtStrike}u contra el Monolito #${obs.id}, pero los monolitos rojos son indestructibles y solo se esquivan con [A].`;
            } else {
                verdict = 'DINÁMICA DE JUEGO (SIN ESQUIVE CON [A])';
                explanation = `Chocaste contra un Monolito Sólido (#${obs.id}) en ${laneNames[obs.lane]} sin haber cambiado de carril a tiempo.`;
            }
        } else if (obs.state === 'TOPPLING' || obs.state === 'COLLAPSED_IN_OTHER_LANE') {
            verdict = 'DINÁMICA DE JUEGO (TE METISTE AL CARRIL DONDE CAYÓ EL MURO)';
            explanation = `Sí tumbaste el muro amarillo #${obs.id} con [B] desde ${laneNames[obs.initialLane]} hacia ${laneNames[obs.fallTargetLane]} (progreso caída: ${Math.round(obs.toppleProgress * 100)}%), pero luego moviste tu corredor a ${laneNames[obs.fallTargetLane]}.`;
        } else if (obs.hitsReceived > 0 && obs.remainingHits > 0) {
            // Recibió golpe(s) pero le faltaron capas por romper
            verdict = `DINÁMICA DE MASHEO (FALTÓ ${obs.remainingHits} GOLPE DE [B])`;
            explanation = `El obstáculo #${obs.id} (${obs.type}) requería ${obs.requiredHits} golpes de [B]. Recibió ${obs.hitsReceived}/${obs.requiredHits} golpes (quedaban ${obs.remainingHits}) antes del impacto.`;
        } else if (obs.hitsReceived > 0 && obs.state === 'ACTIVE') {
            // Recibió todos los golpes pero seguía ACTIVE -> Esto sí sería un BUG
            verdict = '⚠️ POSIBLE BUG DETECTADO (GOLPE REGISTRADO PERO NO CAMBIÓ DE ESTADO)';
            isBugSuspect = true;
            explanation = `El obstáculo #${obs.id} (${obs.type}) registró ${obs.hitsReceived} golpe(s) y remainingHits=${obs.remainingHits}, pero su estado seguía en ACTIVE al colisionar.`;
        } else if (latestAttempt) {
            const deltaMs = Math.max(0, Math.round(now - latestAttempt.timeMs));
            if (latestAttempt.outcome === 'EMPTY_BUFFERED') {
                if (latestAttempt.relZAtStrike !== null && latestAttempt.relZAtStrike > effRange) {
                    verdict = 'DINÁMICA DE TIMING (PULSASTE [B] DEMASIADO PRONTO / LEJOS)';
                    explanation = `Pulsaste [B] hace ${deltaMs}ms cuando el obstáculo #${obs.id} estaba a ${latestAttempt.relZAtStrike}u de distancia (el alcance máximo es ${effRange}u) y no volviste a pulsar [B] dentro del rango.`;
                } else if (latestAttempt.targetObsLane !== -1 && latestAttempt.targetObsLane !== latestAttempt.playerLane) {
                    verdict = 'DINÁMICA DE CARRIL (PULSASTE [B] EN OTRO CARRIL ANTES DE ENTRAR)';
                    explanation = `Pulsaste [B] hace ${deltaMs}ms mientras estabas en ${laneNames[latestAttempt.playerLane]} (visual=${latestAttempt.playerVisualLane}), pero el obstáculo #${obs.id} estaba en ${laneNames[obs.lane]}.`;
                } else {
                    verdict = '⚠️ REVISAR TIMING / BORDE DE RANGO [B]';
                    isBugSuspect = true;
                    explanation = `Pulsaste [B] hace ${deltaMs}ms (relZ=${latestAttempt.relZAtStrike}u, rango=${effRange}u) pero el golpe quedó en vacío (${latestAttempt.missReason || 'EMPTY'}).`;
                }
            } else if (latestAttempt.targetObsId !== obs.id) {
                verdict = 'DINÁMICA DE PRIORIDAD (TU [B] GOLPEÓ OTRO OBSTÁCULO ANTERIOR)';
                explanation = `Tu último [B] (hace ${deltaMs}ms) impactó al obstáculo #${latestAttempt.targetObsId} (${latestAttempt.targetObsType} en carril ${latestAttempt.targetObsLane + 1} a relZ=${latestAttempt.relZAtStrike}u), y no diste otro toque de [B] para el obstáculo #${obs.id}.`;
            } else {
                verdict = '⚠️ POSIBLE BUG DE SINCRONIZACIÓN';
                isBugSuspect = true;
                explanation = `Tu último [B] apuntó al obstáculo #${obs.id} con resultado ${latestAttempt.outcome} a relZ=${latestAttempt.relZAtStrike}u, pero aun así colisionaste.`;
            }
        } else {
            verdict = 'DINÁMICA DE JUEGO (NO SE PULSÓ [B] CERCA DEL OBSTÁCULO)';
            explanation = `No se registró ninguna pulsación de [B] en los últimos 1.5s antes de chocar contra el obstáculo #${obs.id} (${obs.type}).`;
        }

        const effectiveObsLane = obs.state === 'ACTIVE' ? obs.lane : obs.fallTargetLane;
        const obstacleInfo = `#${obs.id} [${obs.type}] | Estado: ${obs.state} | Golpes: ${obs.hitsReceived}/${obs.requiredHits} | Carril: ${obs.initialLane + 1}${obs.fallTargetLane !== null ? '→' + (obs.fallTargetLane + 1) : ''} | relZ choque: ${Math.round(relZAtDeath)}u`;
        const playerInfo = `Z: ${Math.round(player.z)} (${Math.floor(player.z / 10)}m) | Vel: ${Math.round(player.speed)} u/s | Carril lógico: ${player.lane + 1} (visual: ${player.visualLane.toFixed(2)}) vs Obs carril: ${effectiveObsLane + 1} | BPM: ${player.bpm}`;
        const bInteractionSummary = latestAttempt
            ? `Último [B] hace ${Math.max(0, Math.round(now - latestAttempt.timeMs))}ms → ${latestAttempt.outcome} en Obs #${latestAttempt.targetObsId !== null ? latestAttempt.targetObsId : 'N/A'} (${latestAttempt.targetObsType}) a relZ=${latestAttempt.relZAtStrike !== null ? latestAttempt.relZAtStrike : 'N/A'}u (Rango máx=${latestAttempt.effectiveRange}u)`
            : 'Sin pulsaciones recientes de [B] (< 1.5s)';

        return {
            verdict,
            isBugSuspect,
            explanation,
            obstacleInfo,
            playerInfo,
            bInteractionSummary,
            obstacleHistory: obs.debugHistory,
            recentBAttempts: recentB.slice(0, 4)
        };
    }
}

window.PSR.CollisionSystem = CollisionSystem;
