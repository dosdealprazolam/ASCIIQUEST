/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - MusicManager
 * --------------------------------------------
 * Gestiona el apartado musical del juego:
 *  - Permite cargar cualquier canción (.mp3, .wav, .ogg, .m4a) desde un botón o arrastrándola.
 *  - Guarda la canción en IndexedDB del navegador para que persista al recargar o pasar al Sandbox.
 *  - También intenta cargar automáticamente "music/track.mp3" si existe en la carpeta del proyecto.
 *  - Hace que la música suene automáticamente MIENTRAS EL JUGADOR CORRE y se pause al detenerse/morir.
 */
window.PSR = window.PSR || {};

class MusicManager {
    constructor(eventBus, config) {
        this.eventBus = eventBus;
        this.config = config;

        this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
        if (this.audio) {
            this.audio.loop = true;
            this.audio.volume = 0.75;
        }

        this.trackName = 'Sin canción (Carga un MP3/WAV o pon music/track.mp3)';
        this.hasTrackLoaded = false;
        this.playOnlyWhileRunning = true;
        this.isCurrentlyPlaying = false;

        this._initUI();
        this._restoreTrackFromIndexedDB();
    }

    _initUI() {
        this.elTrackName = document.getElementById('music-track-name');
        this.elStatus = document.getElementById('music-status');
        this.elFileInput = document.getElementById('music-file-input');
        this.elBtnLoad = document.getElementById('btn-load-music');
        this.elVolume = document.getElementById('music-volume');
        this.elChkSyncRun = document.getElementById('chk-music-sync-run');

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
                this.audio.volume = parseFloat(this.elVolume.value);
                this.elVolume.blur();
            });
        }

        if (this.elChkSyncRun) {
            this.elChkSyncRun.addEventListener('change', () => {
                this.playOnlyWhileRunning = this.elChkSyncRun.checked;
                this.elChkSyncRun.blur();
            });
        }

        // Permitir arrastrar y soltar un archivo de audio en cualquier parte de la ventana
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            window.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (file && file.type.startsWith('audio/')) {
                    this.loadAudioFile(file, true);
                }
            });
        }
    }

    loadAudioFile(fileOrBlob, saveToDb = false, customName = null) {
        if (!this.audio) return;
        const url = URL.createObjectURL(fileOrBlob);
        this.audio.src = url;
        this.audio.load();
        this.hasTrackLoaded = true;
        this.trackName = customName || fileOrBlob.name || 'Canción cargada';
        this.isCurrentlyPlaying = false;

        this._updateMusicUI(false);

        if (saveToDb) {
            this._saveTrackToIndexedDB(fileOrBlob, this.trackName);
        }
    }

    /**
     * Se llama en cada frame para sincronizar la música con la carrera del jugador.
     */
    update(player, difficultyLevel = 1) {
        if (!this.audio || !this.hasTrackLoaded) return;

        const isRunningNow = player.isAlive && player.speed > 35;
        const shouldPlay = this.playOnlyWhileRunning ? isRunningNow : player.isAlive;

        if (shouldPlay && !this.isCurrentlyPlaying) {
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
            if (!player.isAlive) {
                // Si murió, rebobinar ligeramente o mantener posición lista para el reinicio
            }
            this.isCurrentlyPlaying = false;
            this._updateMusicUI(false);
        }
    }

    _updateMusicUI(playing) {
        if (this.elTrackName) {
            this.elTrackName.textContent = this.trackName;
        }
        if (this.elStatus) {
            if (!this.hasTrackLoaded) {
                this.elStatus.textContent = 'SIN PISTA';
                this.elStatus.className = 'pill idle';
            } else if (playing) {
                this.elStatus.textContent = '🔊 SONANDO EN CARRERA';
                this.elStatus.className = 'pill active-run';
            } else {
                this.elStatus.textContent = '⏸️ PAUSADA (CORRE CON A)';
                this.elStatus.className = 'pill switch-ready';
            }
        }
    }

    _openDB(callback) {
        if (typeof indexedDB === 'undefined') return;
        try {
            const req = indexedDB.open('PSR_MUSIC_DB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    db.createObjectStore('tracks');
                }
            };
            req.onsuccess = (e) => callback(e.target.result);
        } catch (err) {}
    }

    _saveTrackToIndexedDB(blob, name) {
        this._openDB((db) => {
            try {
                const tx = db.transaction('tracks', 'readwrite');
                tx.objectStore('tracks').put({ blob, name }, 'current_track');
            } catch (err) {}
        });
    }

    _restoreTrackFromIndexedDB() {
        if (typeof indexedDB === 'undefined') return;
        this._openDB((db) => {
            try {
                const tx = db.transaction('tracks', 'readonly');
                const getReq = tx.objectStore('tracks').get('current_track');
                getReq.onsuccess = () => {
                    if (getReq.result && getReq.result.blob) {
                        this.loadAudioFile(getReq.result.blob, false, getReq.result.name);
                    }
                };
            } catch (err) {}
        });
    }
}

window.PSR.MusicManager = MusicManager;
