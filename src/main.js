/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - Orquestador Principal (main.js)
 * ---------------------------------------------------------------
 * Incluye:
 *  - Apartado de Nombre en el HUD:
 *      * Jugadores normales: ven solo la experiencia limpia; al morir ven motivo + consejo +
 *        botón "Reportar Problema"; y si llegan a la meta (5000m) guardan su nombre en SQL (`race_winners`).
 *      * Si Nombre === "DevUser": desbloquea en vivo todas las herramientas de medición
 *        (`#death-dev-inspector`, `⚙️ Sandbox` y la Consola `🛠️ Dev SQL / Reportes`).
 */
window.PSR = window.PSR || {};

class GameApp {
    constructor() {
        this.config = window.PSR.GameConfig;
        this.eventBus = new window.PSR.EventBus();
        this.db = window.PSR.DatabaseManager ? new window.PSR.DatabaseManager() : null;

        this.canvas = document.getElementById('game-canvas');
        this.input = new window.PSR.InputManager(this.eventBus, this.config);
        this.player = new window.PSR.Player(this.config, this.eventBus);
        this.obstacleManager = new window.PSR.ObstacleManager(this.config, this.eventBus);
        this.interactionSystem = new window.PSR.InteractionSystem(this.config, this.eventBus);
        this.collisionSystem = new window.PSR.CollisionSystem(this.config, this.eventBus);
        this.renderer = new window.PSR.Renderer(this.canvas, this.config, this.eventBus);
        this.musicManager = window.PSR.MusicManager
            ? new window.PSR.MusicManager(this.eventBus, this.config)
            : null;

        this.bestDistance = 0;
        this.lastActionFeedback = 'MANTÉN [A] PARA CORRER';
        this.deathTimestamp = 0;
        this.lastDeathDiagnostics = null;
        this.lastDeathReason = '';
        this.hasWonCurrentRun = false;
        this.winnerSavedForRun = false;

        this._cacheHudElements();
        this._initPlayerNameAndDevGate();
        this._bindSystemEvents();
        this.resetRun();

        this.loop = new window.PSR.GameLoop(
            (dt, now) => this.update(dt, now),
            (dt, now) => this.render(dt, now)
        );
        this.loop.start();
    }

    _cacheHudElements() {
        this.uiDistance = document.getElementById('hud-distance');
        this.uiBest = document.getElementById('hud-best');
        this.uiLane = document.getElementById('hud-lane');
        this.uiBpmBox = document.getElementById('hud-bpm-box');
        this.uiBpmValue = document.getElementById('hud-bpm-value');
        this.uiBpmState = document.getElementById('hud-bpm-state');
        this.uiHeartIcon = document.getElementById('hud-heart-icon');
        this.uiLevelName = document.getElementById('hud-level-name');
        this.uiLevelProgressFill = document.getElementById('hud-level-progress-fill');
        this.uiControlA = document.getElementById('hud-control-a');
        this.uiControlB = document.getElementById('hud-control-b');
        this.uiPursuitBar = document.getElementById('hud-pursuit-fill');
        this.uiFeedback = document.getElementById('hud-feedback');

        // Apartado chiquito de Nombre + botones exclusivos de DevUser
        this.inputPlayerName = document.getElementById('player-name-input');
        this.btnOpenDevAdmin = document.getElementById('btn-open-dev-admin');
        this.linkSandboxDev = document.getElementById('link-sandbox-dev');

        // Pantalla de Muerte (Jugador vs DevUser)
        this.deathOverlay = document.getElementById('death-overlay');
        this.deathReasonEl = document.getElementById('death-reason');
        this.deathDetailEl = document.getElementById('death-detail');
        this.deathAdviceEl = document.getElementById('death-advice');
        this.deathScoreEl = document.getElementById('death-score');

        // Formulario de Reportar Problema (para jugadores normales)
        this.btnToggleBugReport = document.getElementById('btn-toggle-bug-report');
        this.bugReportForm = document.getElementById('player-bug-report-form');
        this.bugReportTextarea = document.getElementById('report-bug-textarea');
        this.bugReportStatus = document.getElementById('report-bug-status');
        this.btnSubmitBugReport = document.getElementById('btn-submit-bug-report');

        // Inspector Técnico de Muerte (SOLO DevUser)
        this.devInspectorBox = document.getElementById('death-dev-inspector');
        this.devVerdictEl = document.getElementById('dev-diag-verdict');
        this.devExplanationEl = document.getElementById('dev-diag-explanation');
        this.devObstacleEl = document.getElementById('dev-diag-obstacle');
        this.devPlayerEl = document.getElementById('dev-diag-player');
        this.devBLogEl = document.getElementById('dev-diag-b-log');
        this.btnCopyDiag = document.getElementById('btn-copy-death-diag');
        this.btnOpenDevFromDeath = document.getElementById('btn-open-dev-from-death');
        this.btnRestartRun = document.getElementById('btn-restart-run');

        // Pantalla de Victoria (Solo los que llegan a la meta final)
        this.victoryOverlay = document.getElementById('victory-overlay');
        this.victoryScoreEl = document.getElementById('victory-score');
        this.victoryNameInput = document.getElementById('victory-name-input');
        this.btnSaveWinner = document.getElementById('btn-save-winner');
        this.victorySavedMsg = document.getElementById('victory-saved-msg');
        this.btnVictoryPlayAgain = document.getElementById('btn-victory-play-again');

        // Modal Exclusivo de Administración DevUser
        this.devAdminModal = document.getElementById('dev-admin-modal');
        this.btnCloseDevAdmin = document.getElementById('btn-close-dev-admin');
        this.tabBtnReports = document.getElementById('tab-btn-reports');
        this.tabBtnWinners = document.getElementById('tab-btn-winners');
        this.tabBtnSql = document.getElementById('tab-btn-sql');
        this.devTabReports = document.getElementById('dev-tab-reports');
        this.devTabWinners = document.getElementById('dev-tab-winners');
        this.devTabSql = document.getElementById('dev-tab-sql');
        this.devReportsList = document.getElementById('dev-reports-list');
        this.devWinnersList = document.getElementById('dev-winners-list');
        this.devSqlPreview = document.getElementById('dev-sql-preview');
        this.countBugReportsEl = document.getElementById('count-bug-reports');
        this.countRaceWinnersEl = document.getElementById('count-race-winners');
        this.btnClearReports = document.getElementById('btn-clear-reports');
        this.btnClearWinners = document.getElementById('btn-clear-winners');
        this.btnSimulateWinDev = document.getElementById('btn-simulate-win-dev');
        this.btnCopySqlDump = document.getElementById('btn-copy-sql-dump');
        this.btnDownloadSqlDump = document.getElementById('btn-download-sql-dump');
    }

    getCurrentPlayerName() {
        if (this.inputPlayerName && this.inputPlayerName.value) {
            return this.inputPlayerName.value.trim();
        }
        return this.db ? this.db.getSavedPlayerName() : '';
    }

    isDevMode() {
        const name = this.getCurrentPlayerName();
        return name === 'DevUser';
    }

    _initPlayerNameAndDevGate() {
        if (this.inputPlayerName && this.db) {
            const saved = this.db.getSavedPlayerName();
            if (saved) {
                this.inputPlayerName.value = saved;
            }
            this.inputPlayerName.addEventListener('input', () => {
                this.db.setSavedPlayerName(this.inputPlayerName.value);
                this._applyDevModeVisibility();
            });
            this.inputPlayerName.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.inputPlayerName.blur();
                }
            });
        }
        this._applyDevModeVisibility();
    }

    /**
     * Oculta todas las herramientas de depuración para jugadores normales
     * y las muestra únicamente cuando el Nombre es exactamente "DevUser".
     */
    _applyDevModeVisibility() {
        const dev = this.isDevMode();
        if (this.btnOpenDevAdmin) {
            this.btnOpenDevAdmin.classList.toggle('hidden', !dev);
        }
        if (this.linkSandboxDev) {
            this.linkSandboxDev.classList.toggle('hidden', !dev);
        }
        if (this.devInspectorBox) {
            this.devInspectorBox.classList.toggle('hidden', !dev);
        }
        if (!dev && this.devAdminModal) {
            this.devAdminModal.classList.add('hidden');
        }
    }

    _bindSystemEvents() {
        this.eventBus.on('input:lane_change', ({ type, targetLane }) => {
            if (!this.player.isAlive || this.hasWonCurrentRun) return;
            this.player.setTargetLane(targetLane, type);
            this.input.syncLane(targetLane);

            const laneName = this.config.LANES.NAMES[targetLane];
            if (type === 'SINGLE_TAP_NEXT') {
                this.lastActionFeedback = `1 TOQUE [A] → ${laneName}`;
            } else {
                this.lastActionFeedback = `2 TOQUES [A] → ${laneName}`;
            }
        });

        this.eventBus.on('input:lane_switch_unlocked', () => {
            if (!this.player.isAlive || this.hasWonCurrentRun) return;
            this.lastActionFeedback = '[A] SUELTA: CAMBIO DE CARRIL HABILITADO (1 o 2 TOQUES)';
        });

        this.eventBus.on('input:b_action', () => {
            if (this.hasWonCurrentRun) return;
            if (!this.player.isAlive) {
                // No reiniciar si el jugador está escribiendo un reporte de problema o con el modal dev abierto
                const reportOpen = this.bugReportForm && !this.bugReportForm.classList.contains('hidden');
                const devModalOpen = this.devAdminModal && !this.devAdminModal.classList.contains('hidden');
                if (!reportOpen && !devModalOpen && performance.now() - this.deathTimestamp > 750) {
                    this.resetRun();
                }
                return;
            }
            this.interactionSystem.executeContextualAction(
                this.player,
                this.obstacleManager.obstacles
            );
        });

        this.eventBus.on('interaction:mash_hit', ({ remainingHits, requiredHits }) => {
            this.lastActionFeedback = `⚡ ¡IMPACTO [B]! ¡SIGUE MASHEANDO! (Quedan ${remainingHits}/${requiredHits})`;
        });

        this.eventBus.on('interaction:manipulated', ({ toLane }) => {
            const targetName = this.config.LANES.NAMES[toLane];
            this.lastActionFeedback = `💥 [B] ESTRUCTURA DERRUMBADA HACIA ${targetName}`;
        });

        this.eventBus.on('interaction:shattered', () => {
            this.lastActionFeedback = '💥 [B] BARRICADA DESTROZADA AL PASO';
        });

        this.eventBus.on('player:barricade_trauma', () => {
            this.lastActionFeedback = '⚠️ ¡IMPACTO CONTRA ESCOMBROS! USA [B] PARA ROMPERLOS';
        });

        this.eventBus.on('interaction:resisted', () => {
            this.lastActionFeedback = '🛡️ [B] INÚTIL: MONOLITO INDESTRUCTIBLE — ESQUIVA CON [A]';
        });

        this.eventBus.on('difficulty:level_up', ({ config }) => {
            this.lastActionFeedback = `🔥 ¡${config.name}! (${config.subtitle})`;
        });

        this.eventBus.on('input:a_down', ({ timestamp }) => {
            if (this.hasWonCurrentRun) return;
            if (!this.player.isAlive) {
                const reportOpen = this.bugReportForm && !this.bugReportForm.classList.contains('hidden');
                const devModalOpen = this.devAdminModal && !this.devAdminModal.classList.contains('hidden');
                if (!reportOpen && !devModalOpen && timestamp - this.deathTimestamp > 750) {
                    this.resetRun();
                }
            }
        });

        this.eventBus.on('input:restart', () => {
            this.resetRun();
        });

        if (this.btnRestartRun) {
            this.btnRestartRun.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetRun();
            });
        }

        // --- Botón "Reportar Problema" para jugadores en la pantalla de muerte ---
        if (this.btnToggleBugReport) {
            this.btnToggleBugReport.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.bugReportForm) return;
                this.bugReportForm.classList.toggle('hidden');
                if (!this.bugReportForm.classList.contains('hidden') && this.bugReportTextarea) {
                    this.bugReportTextarea.focus();
                }
            });
        }

        if (this.btnSubmitBugReport) {
            this.btnSubmitBugReport.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.db || !this.bugReportTextarea) return;
                const msg = this.bugReportTextarea.value.trim();
                if (!msg) {
                    if (this.bugReportStatus) {
                        this.bugReportStatus.textContent = '⚠️ Escribe un mensaje antes de enviar.';
                    }
                    return;
                }
                const distMeters = Math.floor(this.player.z / 10);
                this.db.insertBugReport({
                    playerName: this.getCurrentPlayerName() || 'Jugador',
                    userMessage: msg,
                    distanceMeters: distMeters,
                    levelReached: this.obstacleManager.currentLevel,
                    deathReason: this.lastDeathReason || 'COLISIÓN',
                    diagnostics: this.lastDeathDiagnostics
                });
                this.bugReportTextarea.value = '';
                if (this.bugReportStatus) {
                    this.bugReportStatus.textContent = '✅ ¡Reporte enviado! Gracias por ayudarnos a mejorar.';
                }
                this._refreshDevAdminUI();
            });
        }

        // --- Acciones del Dev Inspector y Modal DevUser ---
        if (this.btnCopyDiag) {
            this.btnCopyDiag.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.lastDeathDiagnostics) return;
                const payload = JSON.stringify(this.lastDeathDiagnostics, null, 2);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(payload);
                }
                this.btnCopyDiag.textContent = '✅ ¡Reporte Copiado!';
                setTimeout(() => {
                    if (this.btnCopyDiag) this.btnCopyDiag.textContent = '📋 Copiar Reporte Dev';
                }, 1500);
            });
        }

        if (this.btnOpenDevAdmin) {
            this.btnOpenDevAdmin.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openDevAdminModal();
            });
        }

        if (this.btnOpenDevFromDeath) {
            this.btnOpenDevFromDeath.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openDevAdminModal();
            });
        }

        if (this.btnCloseDevAdmin) {
            this.btnCloseDevAdmin.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.devAdminModal) this.devAdminModal.classList.add('hidden');
            });
        }

        this._bindDevAdminTabsAndButtons();
        this._bindVictoryOverlayEvents();

        this.eventBus.on('player:died', ({ reason, detail, advice, diagnostics, distance }) => {
            this.deathTimestamp = performance.now();
            this.lastDeathDiagnostics = diagnostics || null;
            this.lastDeathReason = reason || 'COLISIÓN';

            if (distance > this.bestDistance) {
                this.bestDistance = distance;
            }
            if (this.deathReasonEl) this.deathReasonEl.textContent = reason;
            if (this.deathDetailEl) this.deathDetailEl.textContent = detail;
            if (this.deathAdviceEl) {
                this.deathAdviceEl.textContent = advice || '💡 CONSEJO: Mantén el ritmo con [A] y usa [B] al acercarte a estructuras rompibles.';
            }
            if (this.deathScoreEl) {
                this.deathScoreEl.textContent = `DISTANCIA: ${distance} m (NIVEL ${this.obstacleManager.currentLevel}/5)  |  RÉCORD: ${this.bestDistance} m`;
            }

            // Reiniciar el formulario de reporte de jugador
            if (this.bugReportForm) this.bugReportForm.classList.add('hidden');
            if (this.bugReportStatus) this.bugReportStatus.textContent = '';

            // Actualizar telemetría (solo visible si Nombre === DevUser)
            this._applyDevModeVisibility();
            if (diagnostics) {
                if (this.devVerdictEl) {
                    this.devVerdictEl.textContent = diagnostics.verdict;
                    this.devVerdictEl.className = diagnostics.isBugSuspect
                        ? 'dev-verdict-badge bug-suspect'
                        : 'dev-verdict-badge';
                }
                if (this.devExplanationEl) this.devExplanationEl.textContent = diagnostics.explanation || '';
                if (this.devObstacleEl) this.devObstacleEl.textContent = diagnostics.obstacleInfo || '-';
                if (this.devPlayerEl) this.devPlayerEl.textContent = diagnostics.playerInfo || '-';
                if (this.devBLogEl) this.devBLogEl.textContent = diagnostics.bInteractionSummary || '-';
            }

            if (this.deathOverlay) this.deathOverlay.classList.remove('hidden');
        });
    }

    _bindVictoryOverlayEvents() {
        if (this.btnSaveWinner) {
            this.btnSaveWinner.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.db || this.winnerSavedForRun) return;
                const nameVal = (this.victoryNameInput && this.victoryNameInput.value.trim())
                    || this.getCurrentPlayerName()
                    || 'Sobreviviente';
                if (this.inputPlayerName) {
                    this.inputPlayerName.value = nameVal;
                }
                this.db.setSavedPlayerName(nameVal);
                this._applyDevModeVisibility();

                const distMeters = Math.floor(this.player.z / 10);
                this.db.insertWinner({
                    playerName: nameVal,
                    distanceMeters: distMeters,
                    finalBpm: this.player.bpm
                });
                this.winnerSavedForRun = true;
                if (this.victorySavedMsg) {
                    this.victorySavedMsg.textContent = `✅ ¡${nameVal} guardado en la tabla SQL race_winners!`;
                }
                this._refreshDevAdminUI();
            });
        }

        if (this.btnVictoryPlayAgain) {
            this.btnVictoryPlayAgain.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetRun();
            });
        }
    }

    _bindDevAdminTabsAndButtons() {
        const switchTab = (activeTab) => {
            if (this.devTabReports) this.devTabReports.classList.toggle('hidden', activeTab !== 'reports');
            if (this.devTabWinners) this.devTabWinners.classList.toggle('hidden', activeTab !== 'winners');
            if (this.devTabSql) this.devTabSql.classList.toggle('hidden', activeTab !== 'sql');

            if (this.tabBtnReports) this.tabBtnReports.classList.toggle('active-dev-tab', activeTab === 'reports');
            if (this.tabBtnWinners) this.tabBtnWinners.classList.toggle('active-dev-tab', activeTab === 'winners');
            if (this.tabBtnSql) this.tabBtnSql.classList.toggle('active-dev-tab', activeTab === 'sql');
            this._refreshDevAdminUI();
        };

        if (this.tabBtnReports) this.tabBtnReports.addEventListener('click', () => switchTab('reports'));
        if (this.tabBtnWinners) this.tabBtnWinners.addEventListener('click', () => switchTab('winners'));
        if (this.tabBtnSql) this.tabBtnSql.addEventListener('click', () => switchTab('sql'));

        if (this.btnClearReports) {
            this.btnClearReports.addEventListener('click', () => {
                if (this.db) this.db.clearBugReports();
                this._refreshDevAdminUI();
            });
        }

        if (this.btnClearWinners) {
            this.btnClearWinners.addEventListener('click', () => {
                if (this.db) this.db.clearWinners();
                this._refreshDevAdminUI();
            });
        }

        if (this.btnSimulateWinDev) {
            this.btnSimulateWinDev.addEventListener('click', () => {
                if (this.devAdminModal) this.devAdminModal.classList.add('hidden');
                this.player.z = (this.config.DIFFICULTY.RACE_GOAL_METERS || 10000) * 10;
                this._triggerRaceVictory();
            });
        }

        if (this.btnCopySqlDump) {
            this.btnCopySqlDump.addEventListener('click', () => {
                if (!this.db) return;
                const sql = this.db.exportSqlDump();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(sql);
                }
                this.btnCopySqlDump.textContent = '✅ ¡SQL Copiado!';
                setTimeout(() => {
                    if (this.btnCopySqlDump) this.btnCopySqlDump.textContent = '📋 Copiar SQL Completo';
                }, 1500);
            });
        }

        if (this.btnDownloadSqlDump) {
            this.btnDownloadSqlDump.addEventListener('click', () => {
                if (!this.db || typeof Blob === 'undefined') return;
                const sql = this.db.exportSqlDump();
                const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'asciiquest_database.sql';
                a.click();
            });
        }
    }

    _openDevAdminModal() {
        if (!this.isDevMode() || !this.devAdminModal) return;
        this._refreshDevAdminUI();
        this.devAdminModal.classList.remove('hidden');
    }

    _refreshDevAdminUI() {
        if (!this.db) return;
        const reports = this.db.getBugReports();
        const winners = this.db.getWinners();

        if (this.countBugReportsEl) this.countBugReportsEl.textContent = `${reports.length}`;
        if (this.countRaceWinnersEl) this.countRaceWinnersEl.textContent = `${winners.length}`;

        if (this.devReportsList) {
            if (reports.length === 0) {
                this.devReportsList.innerHTML = '<div style="color:#64748b; padding:10px;">No hay reportes de problemas todavía.</div>';
            } else {
                this.devReportsList.innerHTML = reports.map((r) => `
                    <div class="dev-record-card">
                        <div style="display:flex; justify-content:space-between; color:#ff9f1c; font-weight:bold;">
                            <span>#${r.id} — Jugador: ${r.player_name} (${r.distance_meters}m, Nv.${r.level_reached})</span>
                            <span style="color:#64748b;">${r.created_at}</span>
                        </div>
                        <div style="color:#ffffff; margin:4px 0;">💬 "${r.user_message}"</div>
                        <div style="color:#2ec4b6; font-size:10px;">🔍 Veredicto Motor: ${r.dev_verdict}</div>
                        <div style="color:#94a3b8; font-size:10px;">${r.dev_explanation}</div>
                        <div style="color:#64748b; font-size:10px; margin-top:2px;">Obs: ${r.obstacle_telemetry} | Input B: ${r.b_input_telemetry}</div>
                    </div>
                `).join('');
            }
        }

        if (this.devWinnersList) {
            if (winners.length === 0) {
                this.devWinnersList.innerHTML = '<div style="color:#64748b; padding:10px;">Aún ningún corredor ha llegado a la meta final (5000m).</div>';
            } else {
                this.devWinnersList.innerHTML = winners.map((w) => `
                    <div class="dev-record-card" style="border-left-color:#2ec4b6;">
                        <div style="display:flex; justify-content:space-between; color:#2ec4b6; font-weight:bold;">
                            <span>🏆 #${w.id} — ${w.player_name}</span>
                            <span>${w.distance_meters} m (${w.final_bpm} BPM)</span>
                        </div>
                        <div style="color:#64748b; font-size:10px;">Fecha: ${w.completed_at}</div>
                    </div>
                `).join('');
            }
        }

        if (this.devSqlPreview) {
            this.devSqlPreview.value = this.db.exportSqlDump();
        }
    }

    _triggerRaceVictory() {
        if (this.hasWonCurrentRun) return;
        this.hasWonCurrentRun = true;
        this.winnerSavedForRun = false;
        this.player.speed = 0;

        const distMeters = Math.floor(this.player.z / 10);
        if (distMeters > this.bestDistance) {
            this.bestDistance = distMeters;
        }
        if (this.victoryScoreEl) {
            this.victoryScoreEl.textContent = `META ALCANZADA: ${distMeters} m  |  PULSO FINAL: ${this.player.bpm} BPM`;
        }
        if (this.victoryNameInput) {
            this.victoryNameInput.value = this.getCurrentPlayerName();
        }
        if (this.victorySavedMsg) {
            this.victorySavedMsg.textContent = '';
        }
        if (this.victoryOverlay) {
            this.victoryOverlay.classList.remove('hidden');
        }
    }

    resetRun() {
        this.hasWonCurrentRun = false;
        this.winnerSavedForRun = false;
        this.player.reset();
        this.input.reset(this.player.lane);
        this.obstacleManager.reset();
        if (this.interactionSystem && this.interactionSystem.reset) {
            this.interactionSystem.reset();
        }
        if (this.deathOverlay) this.deathOverlay.classList.add('hidden');
        if (this.victoryOverlay) this.victoryOverlay.classList.add('hidden');
        this._applyDevModeVisibility();
        this.lastActionFeedback = 'NIVEL 1/5: MANTÉN [A] PARA CORRER — MASHEA [B] PARA ROMPER/EMPUJAR';
    }

    update(dt, now) {
        this.input.update(now);

        if (this.player.isAlive && !this.hasWonCurrentRun) {
            this.player.update(dt, now, this.input.isHoldingA);
            this.obstacleManager.update(dt, this.player);
            this.interactionSystem.update(dt, this.player, this.obstacleManager.obstacles);
            this.collisionSystem.update(
                this.player,
                this.obstacleManager.obstacles,
                this.interactionSystem
            );

            // Comprobar si llegó al final de la carrera (10000m por defecto)
            const goalMeters = (this.config.DIFFICULTY && this.config.DIFFICULTY.RACE_GOAL_METERS) || 10000;
            if (this.player.isAlive && Math.floor(this.player.z / 10) >= goalMeters) {
                this._triggerRaceVictory();
            }
        }

        if (this.musicManager) {
            this.musicManager.update(this.player, this.obstacleManager.currentLevel);
        }

        this._updateHud(now);
    }

    render(dt, now) {
        this.renderer.render(dt, now, {
            player: this.player,
            obstacles: this.obstacleManager.obstacles,
            inputState: this.input.getControlState(now)
        });
    }

    _updateHud(now) {
        const distMeters = Math.floor(this.player.z / 10);
        if (distMeters > this.bestDistance) {
            this.bestDistance = distMeters;
        }

        if (this.uiDistance) this.uiDistance.textContent = `${distMeters} m`;
        if (this.uiBest) this.uiBest.textContent = `${this.bestDistance} m`;
        if (this.uiLane) this.uiLane.textContent = this.config.LANES.NAMES[this.player.lane];

        // Monitor Cardíaco (BPM progresivo desde ~110 -> 180 + icono corazon.png)
        if (this.uiBpmValue) {
            const bpm = this.player.bpm || 110;
            const anchor = this.player.baseBpmAnchor || 110;
            const strikeBoost = Math.round(this.player.bpmStrikeBoost || 0);
            const exertionPct = Math.round((this.player.cardiacExertion || 0) * 100);
            this.uiBpmValue.textContent = `${bpm}`;

            if (this.uiHeartIcon) {
                const beatScale = 1 + Math.max(0, Math.sin(this.player.heartPulsePhase || 0)) * 0.28;
                this.uiHeartIcon.style.transform = `scale(${beatScale.toFixed(2)})`;
            }

            if (this.uiBpmBox) {
                if (this.player.traumaRecoveryTimer > 0) {
                    this.uiBpmBox.className = 'bpm-readout-box bpm-drop-nine';
                } else if (!this.player.hasStartedRunning) {
                    this.uiBpmBox.className = 'bpm-readout-box bpm-steady';
                } else if (anchor >= 180 || strikeBoost > 0) {
                    this.uiBpmBox.className = 'bpm-readout-box bpm-max';
                } else if (this.input.isHoldingA && exertionPct < 96) {
                    this.uiBpmBox.className = 'bpm-readout-box bpm-steady';
                } else {
                    this.uiBpmBox.className = (bpm % 10 === 9)
                        ? 'bpm-readout-box bpm-drop-nine'
                        : 'bpm-readout-box bpm-drop-zero';
                }
            }
        }

        const lvl = this.obstacleManager.currentLevel;
        const lvlCfg = this.obstacleManager.getLevelConfig(lvl);
        if (this.uiLevelName) {
            this.uiLevelName.textContent = `${lvlCfg.name} (${lvl}/5)`;
        }
        if (this.uiLevelProgressFill) {
            const metersPerLvl = this.config.DIFFICULTY.METERS_PER_LEVEL || 1000;
            const pct = lvl >= 5 ? 100 : ((distMeters % metersPerLvl) / metersPerLvl) * 100;
            this.uiLevelProgressFill.style.width = `${pct}%`;
        }

        const ctrl = this.input.getControlState(now);
        if (this.uiControlA) {
            if (ctrl.isHoldingA) {
                this.uiControlA.textContent = `A: CORRIENDO (${Math.round(this.player.speed)} u/s)`;
                this.uiControlA.className = 'pill active-run';
            } else if (ctrl.laneSwitchReady) {
                this.uiControlA.textContent = 'A: CAMBIO LISTO (1 o 2 TOQUES)';
                this.uiControlA.className = 'pill switch-ready';
            } else {
                this.uiControlA.textContent = 'A: DETENIDO (MANTÉN A)';
                this.uiControlA.className = 'pill idle';
            }
        }

        if (this.uiControlB) {
            if (this.player.bActionTimer > 0 || ctrl.bMashRate > 0) {
                this.uiControlB.textContent = `B: ${this.player.bLastOutcome} (${ctrl.bMashRate} puls/s)`;
                this.uiControlB.className = 'pill active-b';
            } else {
                this.uiControlB.textContent = 'B: MASHEO CONTEXTUAL';
                this.uiControlB.className = 'pill idle';
            }
        }

        if (this.uiPursuitBar) {
            const pursuitPct = Math.max(0, Math.min(100, (this.player.pursuitDistance / this.config.PURSUIT.INITIAL_DISTANCE) * 100));
            this.uiPursuitBar.style.width = `${pursuitPct}%`;
            this.uiPursuitBar.style.backgroundColor = pursuitPct < 40 ? '#ff1e38' : '#e2e8f0';
        }

        if (this.uiFeedback) {
            this.uiFeedback.textContent = this.lastActionFeedback;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.PSR.app = new GameApp();
});
