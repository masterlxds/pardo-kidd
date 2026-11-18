import type { Level } from '../core/types';
import { createLevel1, createLevel2, createLevel3, createLevel4 } from './level';

/** Fábricas das fases, em ordem (índice = GameState.levelIndex). */
export const LEVELS: (() => Level)[] = [createLevel1, createLevel2, createLevel3, createLevel4];
export const LEVEL_COUNT = LEVELS.length;
