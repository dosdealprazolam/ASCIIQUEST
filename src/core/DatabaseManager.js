/**
 * PSYCHOLOGICAL SURVIVAL RUNNER - DatabaseManager (SQL + Persistencia Local para Ganadores y Reportes)
 * ----------------------------------------------------------------------------------------------------
 * Administra dos tablas relacionales:
 *  1. `race_winners`: Solo jugadores que completan la carrera (llegan a la meta final).
 *  2. `bug_reports`:  Reportes enviados por jugadores desde la pantalla de muerte, guardando
 *                     también la telemetría técnica oculta para que `DevUser` la revise.
 *
 * Permite exportar un dump `.sql` completo (`CREATE TABLE` + `INSERT INTO`) listo para importar
 * en SQLite / PostgreSQL / MySQL.
 */
window.PSR = window.PSR || {};

const DB_WINNERS_KEY = 'PSR_SQL_RACE_WINNERS_V1';
const DB_REPORTS_KEY = 'PSR_SQL_BUG_REPORTS_V1';
const DB_PLAYER_NAME_KEY = 'PSR_CURRENT_PLAYER_NAME_V1';
const MAX_WINNERS_LIMIT = 30;

class DatabaseManager {
    constructor() {
        this.maxWinners = MAX_WINNERS_LIMIT;
        const loadedWinners = this._loadTable(DB_WINNERS_KEY);
        // Asegurar que nunca supere los primeros 30 ganadores registrados
        this.winners = loadedWinners.length > this.maxWinners
            ? loadedWinners.slice(loadedWinners.length - this.maxWinners)
            : loadedWinners;
        this.bugReports = this._loadTable(DB_REPORTS_KEY);
    }

    _loadTable(key) {
        try {
            const raw = window.localStorage && window.localStorage.getItem(key);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    _saveTable(key, rows) {
        try {
            if (window.localStorage) {
                window.localStorage.setItem(key, JSON.stringify(rows));
            }
        } catch (e) {}
    }

    getSavedPlayerName() {
        try {
            return (window.localStorage && window.localStorage.getItem(DB_PLAYER_NAME_KEY)) || '';
        } catch (e) {
            return '';
        }
    }

    setSavedPlayerName(name) {
        const clean = (name || '').trim();
        try {
            if (window.localStorage) {
                window.localStorage.setItem(DB_PLAYER_NAME_KEY, clean);
            }
        } catch (e) {}
        return clean;
    }

    isDevUser(name) {
        return (name || '').trim() === 'DevUser';
    }

    isWinnersFull() {
        return this.winners.length >= this.maxWinners;
    }

    /**
     * Registra un ganador que llegó al final de la carrera (tabla `race_winners`).
     * Solo guarda los primeros 30 en ganar para no saturar la lista.
     */
    insertWinner({ playerName, distanceMeters, finalBpm }) {
        if (this.winners.length >= this.maxWinners) {
            return null;
        }
        const cleanName = (playerName || 'Anónimo').trim() || 'Anónimo';
        const row = {
            id: this.winners.length + 1,
            player_name: cleanName,
            distance_meters: Math.floor(distanceMeters || 0),
            final_bpm: Math.round(finalBpm || 180),
            completed_at: new Date().toISOString()
        };
        this.winners.unshift(row);
        this._saveTable(DB_WINNERS_KEY, this.winners);
        return row;
    }

    /**
     * Registra un reporte de problema enviado por un jugador al morir (tabla `bug_reports`).
     */
    insertBugReport({ playerName, userMessage, distanceMeters, levelReached, deathReason, diagnostics }) {
        const cleanName = (playerName || 'Jugador').trim() || 'Jugador';
        const cleanMsg = (userMessage || '').trim();
        if (!cleanMsg) return null;

        const diag = diagnostics || {};
        const row = {
            id: this.bugReports.length > 0 ? this.bugReports[0].id + 1 : 1,
            player_name: cleanName,
            user_message: cleanMsg,
            distance_meters: Math.floor(distanceMeters || 0),
            level_reached: levelReached || 1,
            death_reason: deathReason || 'COLISIÓN',
            dev_verdict: diag.verdict || 'N/A',
            dev_explanation: diag.explanation || '',
            obstacle_telemetry: diag.obstacleInfo || '-',
            player_telemetry: diag.playerInfo || '-',
            b_input_telemetry: diag.bInteractionSummary || '-',
            created_at: new Date().toISOString()
        };
        this.bugReports.unshift(row);
        this._saveTable(DB_REPORTS_KEY, this.bugReports);
        return row;
    }

    getWinners() {
        return this.winners;
    }

    getBugReports() {
        return this.bugReports;
    }

    clearBugReports() {
        this.bugReports = [];
        this._saveTable(DB_REPORTS_KEY, this.bugReports);
    }

    clearWinners() {
        this.winners = [];
        this._saveTable(DB_WINNERS_KEY, this.winners);
    }

    _escapeSql(val) {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    }

    /**
     * Genera el script SQL completo con CREATE TABLE + INSERT INTO de todos los ganadores y reportes.
     */
    exportSqlDump() {
        const lines = [
            '-- PSYCHOLOGICAL SURVIVAL RUNNER (ASCIIQUEST) - SQL DUMP',
            `-- Generado: ${new Date().toISOString()}`,
            '',
            'CREATE TABLE IF NOT EXISTS race_winners (',
            '    id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '    player_name VARCHAR(64) NOT NULL,',
            '    distance_meters INTEGER NOT NULL,',
            '    final_bpm INTEGER NOT NULL,',
            '    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            ');',
            '',
            'CREATE TABLE IF NOT EXISTS bug_reports (',
            '    id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '    player_name VARCHAR(64) NOT NULL,',
            '    user_message TEXT NOT NULL,',
            '    distance_meters INTEGER NOT NULL,',
            '    level_reached INTEGER NOT NULL,',
            '    death_reason VARCHAR(120) NOT NULL,',
            '    dev_verdict VARCHAR(160),',
            '    dev_explanation TEXT,',
            '    obstacle_telemetry TEXT,',
            '    player_telemetry TEXT,',
            '    b_input_telemetry TEXT,',
            '    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            ');',
            ''
        ];

        if (this.winners.length > 0) {
            lines.push('-- GANADORES QUE LLEGARON AL FINAL DE LA CARRERA');
            for (const w of [...this.winners].reverse()) {
                lines.push(
                    `INSERT INTO race_winners (id, player_name, distance_meters, final_bpm, completed_at) VALUES (${w.id}, ${this._escapeSql(w.player_name)}, ${w.distance_meters}, ${w.final_bpm}, ${this._escapeSql(w.completed_at)});`
                );
            }
            lines.push('');
        }

        if (this.bugReports.length > 0) {
            lines.push('-- REPORTES DE PROBLEMAS ENVIADOS POR JUGADORES');
            for (const r of [...this.bugReports].reverse()) {
                lines.push(
                    `INSERT INTO bug_reports (id, player_name, user_message, distance_meters, level_reached, death_reason, dev_verdict, dev_explanation, obstacle_telemetry, player_telemetry, b_input_telemetry, created_at) VALUES (${r.id}, ${this._escapeSql(r.player_name)}, ${this._escapeSql(r.user_message)}, ${r.distance_meters}, ${r.level_reached}, ${this._escapeSql(r.death_reason)}, ${this._escapeSql(r.dev_verdict)}, ${this._escapeSql(r.dev_explanation)}, ${this._escapeSql(r.obstacle_telemetry)}, ${this._escapeSql(r.player_telemetry)}, ${this._escapeSql(r.b_input_telemetry)}, ${this._escapeSql(r.created_at)});`
                );
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}

window.PSR.DatabaseManager = DatabaseManager;
