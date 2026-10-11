import type { PlayerMedalId } from '@race/shared';
export function createMedals(options: { root: HTMLElement; definitions: Record<PlayerMedalId, {title:string;detail:string;icon:string}> }): {
 awardMany(ids: PlayerMedalId[], eventKey: string): number;
 update(dt: number, options?: {paused?: boolean;visible?: boolean}): void;
 setSoundEnabled(enabled: boolean): void;
 reset(): void;
 destroy(): void;
};
