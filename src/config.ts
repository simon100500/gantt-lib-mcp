import dotenv from 'dotenv';

// Load .env file (if exists)
dotenv.config();

export interface Config {
  GANTT_AUTOSAVE_PATH?: string;
}

/**
 * Get configuration from environment variables
 */
export function getConfig(): Config {
  return {
    GANTT_AUTOSAVE_PATH: process.env.GANTT_AUTOSAVE_PATH,
  };
}

/**
 * Get autosave path from environment (or null if not set)
 */
export function getAutoSavePath(): string | null {
  return process.env.GANTT_AUTOSAVE_PATH || null;
}
