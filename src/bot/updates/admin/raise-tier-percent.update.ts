import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { cancelKeyboard } from '../../keyboards/keyboards';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminRaiseTierPercentUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action('raise_tier_percent')
    async raiseTierPercent(@Ctx() ctx: Context) {
        console.log('[RaiseTierPercent] Action triggered, setting session step');
        console.log('[RaiseTierPercent] Current session before:', ctx.session);
        ctx.session.step = 'raise_tier_coefficient';
        console.log('[RaiseTierPercent] Current session after:', ctx.session);
        await ctx.reply('Enter coefficient to raise the tier percents:', cancelKeyboard);
        await ctx.answerCbQuery();
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[RaiseTierPercent] Received text, session:', ctx.session);
        console.log('[RaiseTierPercent] Session step:', ctx.session.step);

        if (ctx.session.step !== 'raise_tier_coefficient') {
            console.log('[RaiseTierPercent] Step mismatch, returning');
            return;
        }

        const text = (ctx.message as any).text;
        console.log('[RaiseTierPercent] Processing coefficient:', text);

        try {
            const coefficient = parseFloat(text);

            if (isNaN(coefficient)) {
                throw new Error('Coefficient must be a number');
            }

            console.log('[RaiseTierPercent] Updating assets with coefficient:', coefficient);

            // Get all staking assets and update their tiers
            const assets = await this.prisma.stakingAsset.findMany();
            console.log('[RaiseTierPercent] Found assets:', assets.length);

            for (const asset of assets) {
                const tier = asset.tier as any;

                if (tier && tier.levels && Array.isArray(tier.levels)) {
                    const updatedLevels = tier.levels.map((level: any) => ({
                        ...level,
                        percent: level.percent * coefficient,
                    }));

                    await this.prisma.stakingAsset.update({
                        where: { id: asset.id },
                        data: {
                            tier: {
                                ...tier,
                                levels: updatedLevels,
                            },
                        },
                    });
                }
            }

            ctx.session = {};
            await ctx.reply('Percents raised successfully!');
            console.log('[RaiseTierPercent] Success!');
        } catch (error) {
            console.error('[RaiseTierPercent] Error:', error);
            await ctx.reply(
                error instanceof Error ? error.message : 'An error occurred',
                cancelKeyboard,
            );
        }
    }
}
