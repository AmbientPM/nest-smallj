import { Injectable } from '@nestjs/common';

export interface TierLevel {
    minamount: number;
    maxamount: number;
    percent: number;
}

export interface TierConfig {
    defaultPercent: number;
    levels: TierLevel[];
}

@Injectable()
export class TierService {
    getPercent(tier: TierConfig, amount: number): number {
        if (!tier.levels || tier.levels.length === 0) {
            return tier.defaultPercent;
        }

        // If amount exceeds the highest level, return the highest level percent
        if (amount > tier.levels[tier.levels.length - 1].maxamount) {
            return tier.levels[tier.levels.length - 1].percent;
        }

        // Find matching level
        for (const level of tier.levels) {
            if (level.minamount <= amount && level.maxamount >= amount) {
                return level.percent;
            }
        }

        return tier.defaultPercent;
    }

    createFromLevels(levels: TierLevel[], defaultPercent: number = 0): TierConfig {
        return {
            defaultPercent,
            levels,
        };
    }

    createFromPercent(percent: number): TierConfig {
        return {
            defaultPercent: percent,
            levels: [],
        };
    }

    parseFromString(levelsRaw: string): TierConfig {
        const levels: TierLevel[] = [];
        const levelsArr = levelsRaw.split('\n').filter((line) => line.trim());

        for (const level of levelsArr) {
            const [minamount, maxamount, percent] = level.split('|');

            levels.push({
                minamount: parseFloat(minamount),
                maxamount: parseFloat(maxamount),
                percent: parseFloat(percent),
            });
        }

        return {
            defaultPercent: 0,
            levels,
        };
    }
}
