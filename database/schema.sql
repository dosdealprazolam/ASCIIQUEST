-- ============================================================================
-- PSYCHOLOGICAL SURVIVAL RUNNER (ASCIIQUEST) - Esquema SQL de Base de Datos
-- ============================================================================
-- Tablas para administrar:
--   1. race_winners: Exclusivamente los primeros 30 jugadores en pasar el juego.
--   2. bug_reports:  Reportes de problemas enviados por jugadores al morir,
--                    incluyendo telemetría técnica oculta para DevUser.
-- ============================================================================

CREATE TABLE IF NOT EXISTS race_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name VARCHAR(64) NOT NULL,
    distance_meters INTEGER NOT NULL,
    final_bpm INTEGER NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name VARCHAR(64) NOT NULL,
    user_message TEXT NOT NULL,
    distance_meters INTEGER NOT NULL,
    level_reached INTEGER NOT NULL,
    death_reason VARCHAR(120) NOT NULL,
    dev_verdict VARCHAR(160),
    dev_explanation TEXT,
    obstacle_telemetry TEXT,
    player_telemetry TEXT,
    b_input_telemetry TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
