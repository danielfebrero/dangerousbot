/**
 * Global test setup for Vitest
 * Runs before all test files
 */

import { vi } from 'vitest';

// Suppress console output during tests (except errors)
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});
