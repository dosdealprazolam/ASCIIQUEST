/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - MusicManager (Carpeta /music/ + Efecto Reverb y Corte al Morir)
 * -----------------------------------------------------------------------------------------------
 *  - Carga automáticamente la pista del nivel desde la carpeta "/music/" del proyecto
 *    (intenta primero "music/track.mp3", y si no existe usa "music/level1_track.wav").
 *  - Suena automáticamente en cuanto el corredor empieza a correr manteniendo [A].
 *  - Al morir ("player:died"), aumenta un ligero REVERB cavernoso y se CORTA en seco.
 *  - Incluye también un apartado discreto desplegable (botón 🎵) para ajustar volumen o probar otro archivo.
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

        this.trackName = 'level1_track.wav';
        this.hasTrackLoaded = false;
        this.playOnlyWhileRunning = true;
        this.isCurrentlyPlaying = false;

        // Estado del efecto de muerte (aumento de reverb + corte en seco)
        this.isDyingReverbActive = false;
        this.reverbClones = [];
        this.reverbCutTimeout = null;
        this.audioCtx = null;

        this._initUI();
        this._bindEvents();
        this._loadDefaultProjectTrack();
    }

    /**
     * Carga automáticamente la canción desde la carpeta /music/ del proyecto.
     * Si el usuario puso "music/track.mp3", la usa; si no, carga "music/level1_track.wav".
     */
    _loadDefaultProjectTrack() {
        if (!this.audio) return;

        const primaryPath = (this.config.MUSIC && this.config.MUSIC.PRIMARY_TRACK) || 'music/track.mp3';
        const fallbackPath = (this.config.MUSIC && this.config.MUSIC.FALLBACK_TRACK) || 'music/level1_track.wav';

        // Intentar primero music/track.mp3
        let triedFallback = false;
        const onError = () => {
            if (!triedFallback) {
                triedFallback = true;
                this.audio.src = fallbackPath;
                this.trackName = fallbackPath.split('/').pop();
                this.hasTrackLoaded = true;
                this.audio.load();
                this._updateMusicUI(false);
            }
        };

        this.audio.addEventListener('error', onError, { once: true });
        this.audio.src = primaryPath;
        this.trackName = primaryPath.split('/').pop();
        this.hasTrackLoaded = true;
        this.audio.load();
        this._updateMusicUI(false);
    }

    _bindEvents() {
        if (!this.eventBus) return;

        // Al morir: dispara el aumento de reverb ligero y corta la música en seco
        this.eventBus.on('player:died', () => {
            this.triggerDeathReverbAndCut();
        });
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

        // 1. En el track principal, bajar levemente el pitch para dar tensión psicológica antes del corte
        try {
            this.audio.playbackRate = 0.90;
            this.audio.volume = Math.min(1.0, this.baseVolume * 0.95);
        } catch (e) {}

        // 2. Generar reflexiones acústicas escalonadas (Reverb multi-tap) + cola Convolver WebAudio
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

        // 3. Cola de reverb cavernoso mediante Web Audio API ConvolverNode
        this._playWebAudioReverbTail(durationMs / 1000);

        // 4. Corte en seco (Hard Cut) al terminar el hinchamiento del reverb
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

            // Crear respuesta al impulso (Impulse Response) de cámara oscura con corte abrupto
            const sampleRate = ctx.sampleRate;
            const length = Math.floor(sampleRate * durationSec);
            const impulse = ctx.createBuffer(2, length, sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    const progress = i / length;
                    // Crece ligeramente al inicio (swell de reverb) y se mantiene denso hasta el corte
                    const env = Math.sin(progress * Math.PI) * (1.1 - progress * 0.4);
                    data[i] = (Math.random() * 2 - 1) * env * 0.35;
                }
            }

            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;

            // Pulso resonante grave que alimenta el convolver de reverb al chocar/morir
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(146.83, now); // D3
            osc.frequency.exponentialRampToValueAtTime(65.41, now + durationSec);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(950, now);
            filter.frequency.exponentialRampToValueAtTime(220, now + durationSec);

            gain.gain.setValueAtTime(this.baseVolume * 0.42, now);
            // Corte seco exacto al final del reverb
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

        this._updateMusicUI(false);
    }

    /**
     * Se llama en cada frame para que la canción arranque en cuanto el jugador corre.
     */
    update(player, difficultyLevel = 1) {
        if (!this.audio || !this.hasTrackLoaded) return;

        // Si está sonando el efecto de reverb de muerte, dejamos que termine hasta su corte en seco
        if (this.isDyingReverbActive) {
            if (player.isAlive && player.speed > 35) {
                // Si el jugador reinició rapidísimo y ya volvió a correr, cancelamos el corte y reanudamos normal
                this._clearReverbClones();
                this.isDyingReverbActive = false;
                this.audio.playbackRate = 1.0;
                this.audio.volume = this.baseVolume;
            } else {
                return;
            }
        }

        if (!player.isAlive) return;

        const isRunningNow = player.speed > 35;
        const shouldPlay = this.playOnlyWhileRunning ? isRunningNow : true;

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
                this.elStatus.textContent = '🔊 SONANDO';
                this.elStatus.className = 'pill active-run';
            } else {
                this.elStatus.textContent = '⏸️ CORRE CON [A]';
                this.elStatus.className = 'pill idle';
            }
        }
    }
}

window.PSR.MusicManager = MusicManager;
