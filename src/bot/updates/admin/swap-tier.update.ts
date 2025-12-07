import { Update, Ctx, Action, On } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { Markup } from 'telegraf';
import { cancelKeyboard } from '../../keyboards/keyboards';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminSwapTierUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action('swap_tier')
    async showSwapTier(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();
        const swapTier = (settings?.swapTier as any) || { levels: [] };

        const keyboard = this.buildTierKeyboard(swapTier);

        await ctx.reply('Swap Tier', {
            reply_markup: keyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action(/^swap_tier_edit:(.+):(\d+)$/)
    async editSwapTier(@Ctx() ctx: Context) {
        const callbackQuery = ctx.callbackQuery;
        if (!callbackQuery || !('data' in callbackQuery)) return;

        const [_, command, indexStr] = callbackQuery.data.split(':');
        const index = parseInt(indexStr);

        try {
            let settings = await this.prisma.settings.findFirst();
            if (!settings) {
                settings = await this.prisma.settings.create({
                    data: { swapTier: { levels: [] } },
                });
            }

            const tier = (settings.swapTier as any) || { levels: [] };

            if (command === 'add') {
                tier.levels.push({
                    minamount: 0,
                    maxamount: 0,
                    percent: 0,
                });

                await this.prisma.settings.update({
                    where: { id: settings.id },
                    data: { swapTier: tier },
                });

                const keyboard = this.buildTierKeyboard(tier);
                await ctx.editMessageText('Swap Tier - Level added', {
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery();
            } else if (command === 'finish') {
                tier.levels.sort((a: any, b: any) => a.minamount - b.minamount);

                await this.prisma.settings.update({
                    where: { id: settings.id },
                    data: { swapTier: tier },
                });

                ctx.session = {};
                await ctx.answerCbQuery('Swap Tier saved!');
                await ctx.deleteMessage();
            } else if (command === 'delete') {
                tier.levels.splice(index, 1);

                await this.prisma.settings.update({
                    where: { id: settings.id },
                    data: { swapTier: tier },
                });

                const keyboard = this.buildTierKeyboard(tier);
                await ctx.editMessageText('Swap Tier - Level deleted', {
                    reply_markup: keyboard,
                });
                await ctx.answerCbQuery();
            } else {
                // Edit specific field
                ctx.session.step = `swap_tier_${command}`;
                ctx.session.data = { settingsId: settings.id, index, field: command };
                console.log('Setting session:', ctx.session);
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
        console.log('Text received, session:', ctx.session);
        if (!ctx.session.step?.startsWith('swap_tier_')) return;

        const text = (ctx.message as any).text;

        try {
            const value = parseFloat(text);
            if (isNaN(value)) {
                throw new Error('Value must be a number');
            }

            const { settingsId, index, field } = ctx.session.data || {};

            if (settingsId === undefined || index === undefined || field === undefined) {
                throw new Error('Session data missing. Please start again with /start');
            }

            // Get current settings from DB
            let settings = await this.prisma.settings.findUnique({
                where: { id: settingsId },
            });

            if (!settings) {
                settings = await this.prisma.settings.create({
                    data: { swapTier: { levels: [] } },
                });
            }

            const tier = (settings.swapTier as any) || { levels: [] };

            if (!tier.levels[index]) {
                throw new Error(`Level ${index} not found`);
            }

            // Update the value
            tier.levels[index][field] = value;

            // Save to DB immediately
            await this.prisma.settings.update({
                where: { id: settings.id },
                data: { swapTier: tier },
            });

            // Clear session
            ctx.session = {};

            const keyboard = this.buildTierKeyboard(tier);
            await ctx.reply(`✅ ${field} updated to ${value}`, {
                reply_markup: keyboard,
            });
        } catch (error) {
            console.error('Swap tier update error:', error);
            await ctx.reply(
                error instanceof Error ? error.message : 'Value should be a number, try again',
                cancelKeyboard,
            );
        }
    }

    private buildTierKeyboard(tier: any) {
        const buttons: any[] = [];

        tier.levels.forEach((level: any, index: number) => {
            buttons.push([
                Markup.button.callback(
                    `Level ${index + 1}: ${level.minamount}-${level.maxamount} (${level.percent}%)`,
                    'noop',
                ),
            ]);
            buttons.push([
                Markup.button.callback('Min', `swap_tier_edit:minamount:${index}`),
                Markup.button.callback('Max', `swap_tier_edit:maxamount:${index}`),
                Markup.button.callback('%', `swap_tier_edit:percent:${index}`),
                Markup.button.callback('❌', `swap_tier_edit:delete:${index}`),
            ]);
        });

        buttons.push([Markup.button.callback('➕ Add Level', 'swap_tier_edit:add:0')]);
        buttons.push([Markup.button.callback('✅ Finish', 'swap_tier_edit:finish:0')]);

        return { inline_keyboard: buttons };
    }
}
