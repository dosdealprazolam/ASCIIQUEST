/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - MusicManager
 * --------------------------------------------
 * Ciclo exacto de la música:
 *  1. Carga la pista principal desde "/music/" ("music/Deejay SaeRo - Thud Weight.mp3").
 *  2. Apenas el jugador empieza a correr (presiona [A]), la canción inicia desde 0:00.
 *  3. Cuando el jugador muere ("player:died"), entra en un aumento de REVERB cavernoso
 *     y se corta en seco.
 *  4. Cuando el jugador reinicia y vuelve a correr, la canción vuelve a iniciar desde 0:00.
 */
window.PSR = window.PSR || {};

class MusicManager {
    constructor(eventBus, config) {
        this.eventBus = eventBus;
        this.config = config;

        this.baseVolume = (config.MUSIC && config.MUSIC.DEFAULT_VOLUME) || 0.78;
        this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
        if (this.audio) {
            this.audio.loop = true;
            this.audio.volume = this.baseVolume;
        }

        this.trackName = 'Deejay SaeRo - Thud Weight.mp3';
        this.hasTrackLoaded = false;
        this.playOnlyWhileRunning = true;
        this.isCurrentlyPlaying = false;
        this.lastActiveSongTimeSec = 0;

        // Bandera para asegurar que al empezar una carrera nueva (o tras morir) inicie desde 0:00
        this.needsRestartFromZero = true;

        // Estado del efecto de muerte (aumento de reverb + corte en seco)
        this.isDyingReverbActive = false;
        this.reverbClones = [];
        this.reverbCutTimeout = null;
        this.audioCtx = null;

        this._initUI();
        this._bindEvents();
        this._loadDefaultProjectTrack();
    }

    _loadDefaultProjectTrack() {
        if (!this.audio) return;

        const primaryPath = (this.config.MUSIC && this.config.MUSIC.PRIMARY_TRACK) || 'music/Deejay SaeRo - Thud Weight.mp3';
        const fallbackPath = (this.config.MUSIC && this.config.MUSIC.FALLBACK_TRACK) || 'music/level1_track.wav';

        let triedFallback = false;
        const onError = () => {
            if (!triedFallback) {
                triedFallback = true;
                this.audio.src = encodeURI(fallbackPath);
                this.trackName = fallbackPath.split('/').pop();
                this.hasTrackLoaded = true;
                this.audio.load();
                this._updateMusicUI(false);
            }
        };

        this.audio.onerror = onError;
        this.audio.src = encodeURI(primaryPath);
        this.trackName = primaryPath.split('/').pop();
        this.hasTrackLoaded = true;
        this.audio.load();
        this._updateMusicUI(false);
    }

    _bindEvents() {
        if (!this.eventBus) return;

        // Al morir: dispara el aumento de reverb ligero, corta la música y marca reinicio desde 0:00
        this.eventBus.on('player:died', () => {
            this.needsRestartFromZero = true;
            this.triggerDeathReverbAndCut();
        });

        // Al reiniciar manualmente con R: preparar para arrancar desde 0:00 apenas corra
        this.eventBus.on('input:restart', () => {
            this._hardCutMusic();
            this.needsRestartFromZero = true;
        });
    }

    /**
     * Inicia la canción desde el segundo 0:00 limpiando cualquier cola de reverb previa.
     */
    startFromBeginning() {
        if (!this.audio || !this.hasTrackLoaded) return;

        this._clearReverbClones();
        this.isDyingReverbActive = false;

        try {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio.playbackRate = 1.0;
            this.audio.volume = this.baseVolume;
            this.lastActiveSongTimeSec = 0;
        } catch (e) {}

        const playPromise = this.audio.play();
        this.isCurrentlyPlaying = true;
        this.needsRestartFromZero = false;

        if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
                // Si el navegador aún requiere interacción directa, se reintentará en el siguiente frame con A presionada
                this.isCurrentlyPlaying = false;
                this.needsRestartFromZero = true;
            });
        }

        this._updateMusicUI(true);
    }

    /**
     * Efecto de muerte: Aumenta un ligero reverb cavernoso y corta en seco tras ~680ms.
     */
    triggerDeathReverbAndCut() {
        if (!this.audio || !this.hasTrackLoaded) return;

        this._clearReverbClones();
        this.isDyingReverbActive = true;

        const durationMs = (this.config.MUSIC && this.config.MUSIC.DEATH_REVERB_DURATION_MS) || 680;
        const currentPos = this.audio.currentTime || 0;
        if (currentPos > 0) {
            this.lastActiveSongTimeSec = currentPos;
        }

        try {
            this.audio.playbackRate = 0.90;
            this.audio.volume = Math.min(1.0, this.baseVolume * 0.95);
        } catch (e) {}

        // Reflexiones acústicas escalonadas (Reverb multi-tap)
        const delaysMs = [45, 95, 155, 225];
        const gains = [0.58, 0.42, 0.28, 0.18];

        delaysMs.forEach((delay, idx) => {
            const timerId = setTimeout(() => {
                if (!this.isDyingReverbActive || !this.audio) return;
                try {
                    const echo = this.audio.cloneNode();
                    echo.loop = false;
                    echo.currentTime = currentPos;
                    echo.playbackRate = 0.88 - idx * 0.03;
                    echo.volume = Math.max(0.05, this.baseVolume * gains[idx]);
                    const p = echo.play();
                    if (p && p.catch) p.catch(() => {});
                    this.reverbClones.push(echo);
                } catch (e) {}
            }, delay);
            this.reverbClones.push({ timerId });
        });

        this._playWebAudioReverbTail(durationMs / 1000);

        this.reverbCutTimeout = setTimeout(() => {
            this._hardCutMusic();
        }, durationMs);
    }

    _playWebAudioReverbTail(durationSec) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!this.audioCtx) {
                this.audioCtx = new AudioContextClass();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const ctx = this.audioCtx;
            const now = ctx.currentTime;

            const sampleRate = ctx.sampleRate;
            const length = Math.floor(sampleRate * durationSec);
            const impulse = ctx.createBuffer(2, length, sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    const progress = i / length;
                    const env = Math.sin(progress * Math.PI) * (1.1 - progress * 0.4);
                    data[i] = (Math.random() * 2 - 1) * env * 0.35;
                }
            }

            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;

            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(146.83, now);
            osc.frequency.exponentialRampToValueAtTime(65.41, now + durationSec);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(950, now);
            filter.frequency.exponentialRampToValueAtTime(220, now + durationSec);

            gain.gain.setValueAtTime(this.baseVolume * 0.42, now);
            gain.gain.setValueAtTime(0.0001, now + durationSec - 0.015);

            osc.connect(filter);
            filter.connect(convolver);
            convolver.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + durationSec);
        } catch (e) {}
    }

    _hardCutMusic() {
        this.isDyingReverbActive = false;
        this._clearReverbClones();

        if (this.audio) {
            this.audio.pause();
            try {
                this.audio.currentTime = 0;
                this.audio.playbackRate = 1.0;
                this.audio.volume = this.baseVolume;
            } catch (e) {}
        }
        this.isCurrentlyPlaying = false;
        this._updateMusicUI(false);
    }

    _clearReverbClones() {
        if (this.reverbCutTimeout) {
            clearTimeout(this.reverbCutTimeout);
            this.reverbCutTimeout = null;
        }
        for (const item of this.reverbClones) {
            if (item && item.timerId) {
                clearTimeout(item.timerId);
            } else if (item && item.pause) {
                try {
                    item.pause();
                    item.src = '';
                } catch (e) {}
            }
        }
        this.reverbClones = [];
    }

    _initUI() {
        this.elToggleBtn = document.getElementById('btn-toggle-music-drawer');
        this.elDrawer = document.getElementById('music-discrete-drawer');
        this.elTrackName = document.getElementById('music-track-name');
        this.elStatus = document.getElementById('music-status');
        this.elFileInput = document.getElementById('music-file-input');
        this.elBtnLoad = document.getElementById('btn-load-music');
        this.elVolume = document.getElementById('music-volume');
        this.elChkSyncRun = document.getElementById('chk-music-sync-run');

        if (this.elToggleBtn && this.elDrawer) {
            this.elToggleBtn.addEventListener('click', () => {
                this.elDrawer.classList.toggle('hidden');
                this.elToggleBtn.blur();
            });
        }

        if (this.elBtnLoad && this.elFileInput) {
            this.elBtnLoad.addEventListener('click', () => {
                this.elFileInput.click();
                this.elBtnLoad.blur();
            });

            this.elFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    this.loadAudioFile(file, true);
                }
            });
        }

        if (this.elVolume && this.audio) {
            this.elVolume.addEventListener('input', () => {
                this.baseVolume = parseFloat(this.elVolume.value);
                this.audio.volume = this.baseVolume;
                this.elVolume.blur();
            });
        }

        if (this.elChkSyncRun) {
            this.elChkSyncRun.addEventListener('change', () => {
                this.playOnlyWhileRunning = this.elChkSyncRun.checked;
                this.elChkSyncRun.blur();
            });
        }
    }

    loadAudioFile(fileOrBlob, saveToDb = false, customName = null) {
        if (!this.audio) return;
        this._clearReverbClones();
        this.isDyingReverbActive = false;

        const url = URL.createObjectURL(fileOrBlob);
        this.audio.src = url;
        this.audio.playbackRate = 1.0;
        this.audio.volume = this.baseVolume;
        this.audio.load();
        this.hasTrackLoaded = true;
        this.trackName = customName || fileOrBlob.name || 'Canción cargada';
        this.isCurrentlyPlaying = false;
        this.needsRestartFromZero = true;

        this._updateMusicUI(false);
    }

    /**
     * Se llama en cada frame:
     * - Si el jugador aún no ha empezado a correr (z === 0 y speed === 0), espera en 0:00.
     * - En cuanto empieza a correr (hasStartedRunning o speed > 0), arranca desde 0:00.
     * - Si muere, hace reverb + corte; y al volver a correr tras reiniciar, arranca desde 0:00 nuevamente.
     */
    update(player, difficultyLevel = 1) {
        if (!this.audio || !this.hasTrackLoaded) return;

        // Si el jugador acaba de reiniciar (z === 0 y aún no corre), garantizar que está listo para arrancar desde 0:00
        if (player.isAlive && !player.hasStartedRunning && player.z === 0 && !this.isDyingReverbActive) {
            if (this.isCurrentlyPlaying) {
                this.audio.pause();
                this.audio.currentTime = 0;
                this.isCurrentlyPlaying = false;
                this._updateMusicUI(false);
            }
            this.needsRestartFromZero = true;
            return;
        }

        // Si el jugador ya empezó a correr en una nueva partida (incluso si el reverb de la muerte anterior seguía sonando)
        const hasBegunRunning = player.isAlive && (player.hasStartedRunning || player.speed > 5);

        if (hasBegunRunning && this.needsRestartFromZero) {
            this.startFromBeginning();
            return;
        }

        if (this.isDyingReverbActive) {
            return;
        }

        if (!player.isAlive) return;

        const isMoving = player.speed > 10;
        const shouldPlay = this.playOnlyWhileRunning ? isMoving : true;

        if (shouldPlay && !this.isCurrentlyPlaying) {
            this.audio.playbackRate = 1.0;
            this.audio.volume = this.baseVolume;
            const playPromise = this.audio.play();
            this.isCurrentlyPlaying = true;
            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {
                    this.isCurrentlyPlaying = false;
                });
            }
            this._updateMusicUI(true);
        } else if (!shouldPlay && this.isCurrentlyPlaying) {
            this.audio.pause();
            this.isCurrentlyPlaying = false;
            this._updateMusicUI(false);
        }
        if (this.audio && this.isCurrentlyPlaying && !this.isDyingReverbActive) {
            this.lastActiveSongTimeSec = this.audio.currentTime || 0;
        }
    }

    _formatTimeMmSs(seconds) {
        const s = Math.max(0, Number(seconds) || 0);
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        const tenths = Math.floor((s % 1) * 10);
        const mm = mins < 10 ? '0' + mins : String(mins);
        const ss = secs < 10 ? '0' + secs : String(secs);
        return `${mm}:${ss}.${tenths}`;
    }

    /**
     * Devuelve el tiempo actual de la canción (y el último tiempo activo antes de morir)
     * para que DevUser pueda tomar notas exactas del segundo de la canción.
     */
    getSongTimeInfo() {
        const liveTime = (this.audio && this.audio.currentTime) ? this.audio.currentTime : 0;
        const activeTime = liveTime > 0 ? liveTime : this.lastActiveSongTimeSec;
        const duration = (this.audio && this.audio.duration && !isNaN(this.audio.duration) && isFinite(this.audio.duration))
            ? this.audio.duration
            : 0;
        const fmtCurrent = this._formatTimeMmSs(activeTime);
        const fmtDuration = duration > 0 ? this._formatTimeMmSs(duration) : '--:--.-';
        return {
            currentTimeSec: Number(activeTime.toFixed(2)),
            durationSec: Number(duration.toFixed(2)),
            formattedCurrent: fmtCurrent,
            formattedDuration: fmtDuration,
            formattedLabel: `${fmtCurrent} / ${fmtDuration} (${activeTime.toFixed(1)}s)`
        };
    }

    _updateMusicUI(playing) {
        if (this.elTrackName) {
            this.elTrackName.textContent = `Carpeta /music/: ${this.trackName}`;
        }
        if (this.elStatus) {
            if (this.isDyingReverbActive) {
                this.elStatus.textContent = '🌊 REVERB + CORTE';
                this.elStatus.className = 'pill active-b';
            } else if (playing) {
                this.elStatus.textContent = '🔊 SONANDO (DESDE 0:00)';
                this.elStatus.className = 'pill active-run';
            } else {
                this.elStatus.textContent = '⏸️ CORRE CON [A]';
                this.elStatus.className = 'pill idle';
            }
        }
    }
}

window.PSR.MusicManager = MusicManager;
