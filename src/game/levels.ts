import type { Level } from '../core/types';
import { createLevel1, createLevel2, createLevel3, createLevel4, createLevel5, createLevelUber } from './level';

/** Fábricas das fases, em ordem (índice = GameState.levelIndex). */
export const LEVELS: (() => Level)[] = [createLevel1, createLevel2, createLevel3, createLevel4, createLevelUber, createLevel5];
export const LEVEL_COUNT = LEVELS.length;
