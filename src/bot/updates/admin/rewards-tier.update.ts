import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { Markup } from 'telegraf';
import { cancelKeyboard, adminStakingKeyboard } from '../../keyboards/keyboards';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminRewardsTierUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action('rewards_tier')
    async showRewardsTier(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();
        const rewardsTier = (settings?.rewardsTier as any) || { levels: [] };

        ctx.session.data = { tier: rewardsTier };

        const keyboard = this.buildTierKeyboard(rewardsTier, 'rewards_tier');

        await ctx.reply('Rewards Tier', {
            reply_markup: keyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action(/^rewards_tier_edit:(.+):(\d+)$/)
    async editRewardsTier(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const [_, command, indexStr] = callbackQuery.data.split(':');
        const index = parseInt(indexStr);

        const tier = ctx.session.data?.tier || { levels: [] };

        try {
            if (command === 'add') {
                tier.levels.push({
                    minamount: 0,
                    maxamount: 0,
                    percent: 0,
                });

                ctx.session.data = { tier };

                const keyboard = this.buildTierKeyboard(tier, 'rewards_tier');
                await ctx.editMessageText('Rewards Tier', {
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery();
            } else if (command === 'finish') {
                tier.levels.sort((a: any, b: any) => a.minamount - b.minamount);

                let settings = await this.prisma.settings.findFirst();
                if (!settings) {
                    settings = await this.prisma.settings.create({
                        data: { rewardsTier: tier },
                    });
                } else {
                    await this.prisma.settings.update({
                        where: { id: settings.id },
                        data: { rewardsTier: tier },
                    });
                }

                ctx.session = {};
                await ctx.answerCbQuery('Rewards Tier Updated!');
                await ctx.deleteMessage();

                await ctx.reply('Staking Settings', {
                    parse_mode: 'HTML',
                    ...adminStakingKeyboard,
                });
            } else if (command === 'delete') {
                tier.levels.splice(index, 1);

                ctx.session.data = { tier };

                const keyboard = this.buildTierKeyboard(tier, 'rewards_tier');
                await ctx.editMessageText('Rewards Tier', {
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery();
            } else {
                // Edit specific field
                console.log('[RewardsTier] Setting session for field:', command);
                ctx.session.step = `rewards_tier_${command}`;
                ctx.session.data = { tier, index, field: command };
                console.log('[RewardsTier] Session set:', ctx.session);
                await ctx.reply(`Enter new ${command}:`, cancelKeyboard);
                await ctx.answerCbQuery();
            }
        } catch (error) {
            // Handle "message is not modified" error silently
            if (error instanceof Error && error.message.includes('message is not modified')) {
                await ctx.answerCbQuery();
            } else {
                throw error;
            }
        }
    }

    async handleTextInput(@Ctx() ctx: Context) {
        console.log('[RewardsTier] Text received, session:', ctx.session);
        console.log('[RewardsTier] Session step:', ctx.session.step);

        if (!ctx.session.step?.startsWith('rewards_tier_')) {
            console.log('[RewardsTier] Step mismatch, returning');
            return;
        }

        console.log('[RewardsTier] Processing rewards tier input');

        const text = (ctx.message as any).text;

        try {
            const value = parseFloat(text);
            if (isNaN(value)) {
                throw new Error('Value must be a number');
            }

            const { tier, index, field } = ctx.session.data!;

            // Update the value
            tier.levels[index][field] = value;

            // Keep tier data, clear step
            ctx.session.step = undefined;
            ctx.session.data = { tier };

            const keyboard = this.buildTierKeyboard(tier, 'rewards_tier');
            await ctx.reply('Rewards Tier updated', {
                reply_markup: keyboard,
            });
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'Value should be a number, try again',
                cancelKeyboard,
            );
        }
    }

    private buildTierKeyboard(tier: any, prefix: string) {
        const buttons: any[] = [];

        tier.levels.forEach((level: any, index: number) => {
            buttons.push([
                Markup.button.callback(
                    `Level ${index + 1}: ${level.minamount}-${level.maxamount} (${level.percent}%)`,
                    '.',
                ),
            ]);
            buttons.push([
                Markup.button.callback('Min', `${prefix}_edit:minamount:${index}`),
                Markup.button.callback('Max', `${prefix}_edit:maxamount:${index}`),
                Markup.button.callback('Percent', `${prefix}_edit:percent:${index}`),
                Markup.button.callback('❌', `${prefix}_edit:delete:${index}`),
            ]);
        });

        buttons.push([Markup.button.callback('➕ Add Level', `${prefix}_edit:add:0`)]);
        buttons.push([Markup.button.callback('✅ Finish', `${prefix}_edit:finish:0`)]);

        return { inline_keyboard: buttons };
    }
}
