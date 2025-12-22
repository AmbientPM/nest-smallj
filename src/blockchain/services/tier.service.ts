import { Injectable } from '@nestjs/common';

/**
 * TierLevel Interface
 * 
 * Defines a single tier in the reward system.
 * 
 * EXAMPLE:
 * {
 *   minamount: 1000,    // Must have at least 1000 tokens
 *   maxamount: 5000,    // But not more than 5000 tokens
 *   percent: 2.5        // Earns 2.5% rewards per hour
 * }
 */
export interface TierLevel {
    minamount: number;  // Minimum balance for this tier
    maxamount: number;  // Maximum balance for this tier
    percent: number;    // Reward percentage per hour
}

/**
 * TierConfig Interface
 * 
 * Complete configuration for a tier system.
 * 
 * EXAMPLE TIER SYSTEM:
 * {
 *   defaultPercent: 1,
 *   levels: [
 *     { minamount: 0,     maxamount: 1000,  percent: 1 },    // 0-1K tokens: 1%
 *     { minamount: 1000,  maxamount: 5000,  percent: 2.5 },  // 1K-5K tokens: 2.5%
 *     { minamount: 5000,  maxamount: 10000, percent: 5 },    // 5K-10K tokens: 5%
 *     { minamount: 10000, maxamount: Infinity, percent: 10 } // 10K+ tokens: 10%
 *   ]
 * }
 * 
 * User with 3000 tokens → 2.5% rewards
 * User with 15000 tokens → 10% rewards
 */
export interface TierConfig {
    defaultPercent: number;  // Fallback percentage if no levels match
    levels: TierLevel[];     // Array of tiers, sorted by amount
}

/**
 * TierService
 * 
 * Calculates reward percentages based on user's token balance.
 * 
 * CONCEPT:
 * Users earn different reward rates based on how many tokens they hold.
 * This incentivizes users to hold more tokens.
 * 
 * EXAMPLE CALCULATION:
 * 
 * User has 3500 tokens in a staking asset.
 * Tier config says: 1000-5000 tokens = 2.5% per hour
 * 
 * Hourly reward = 3500 × 2.5% = 87.5 tokens per hour
 * Daily reward = 87.5 × 24 = 2100 tokens per day
 * Monthly reward = 2100 × 30 = 63,000 tokens per month
 * 
 * HOW IT WORKS:
 * 1. Check if there are any tier levels
 *    - If no levels: return defaultPercent
 * 2. Check if amount exceeds highest tier
 *    - If yes: return highest tier's percent
 * 3. Find the tier that matches the amount
 *    - Return that tier's percent
 * 4. If no match: return defaultPercent
 */
@Injectable()
export class TierService {
    /**
     * Calculate reward percentage for a given amount
     * 
     * @param tier - The tier configuration to use
     * @param amount - User's token balance
     * @returns Reward percentage (e.g., 2.5 for 2.5% per hour)
     * 
     * @example
     * const tier = {
     *   defaultPercent: 1,
     *   levels: [
     *     { minamount: 1000, maxamount: 5000, percent: 2.5 }
     *   ]
     * };
     * 
     * getPercent(tier, 500);  // Returns 1 (below first tier)
     * getPercent(tier, 3000); // Returns 2.5 (in tier range)
     * getPercent(tier, 6000); // Returns 2.5 (above highest tier)
     */
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

    /**
     * Create a tier config from an array of levels
     * 
     * @param levels - Array of tier levels
     * @param defaultPercent - Fallback percentage (default: 0)
     * @returns Complete tier configuration
     */
    createFromLevels(levels: TierLevel[], defaultPercent: number = 0): TierConfig {
        return {
            defaultPercent,
            levels,
        };
    }

    /**
     * Create a simple tier config with just one percentage
     * (No levels, everyone gets the same rate)
     * 
     * @param percent - The percentage everyone receives
     * @returns Tier configuration with no levels
     */
    createFromPercent(percent: number): TierConfig {
        return {
            defaultPercent: percent,
            levels: [],
        };
    }

    /**
     * Parse tier config from a text string
     * 
     * Expected format (one level per line):
     * min|max|percent
     * 
     * @example
     * Input string:
     * "0|1000|1
     *  1000|5000|2.5
     *  5000|10000|5"
     * 
     * Result:
     * {
     *   defaultPercent: 0,
     *   levels: [
     *     { minamount: 0, maxamount: 1000, percent: 1 },
     *     { minamount: 1000, maxamount: 5000, percent: 2.5 },
     *     { minamount: 5000, maxamount: 10000, percent: 5 }
     *   ]
     * }
     * 
     * @param levelsRaw - Multi-line string with pipe-separated values
     * @returns Parsed tier configuration
     */
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
