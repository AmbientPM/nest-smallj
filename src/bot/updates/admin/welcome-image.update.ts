import { Update, Ctx, Action } from 'nestjs-telegraf';
import { UseGuards } from '@nestjs/common';
import type { Context } from '../../interfaces/context.interface';
import { IsPrivateGuard } from '../../guards/is-private.guard';
import { IsAdminGuard } from '../../guards/is-admin.guard';
import { PrismaService } from '../../../database/prisma.service';
import { cancelKeyboard } from '../../keyboards/keyboards';
import { MessageManager } from '../../utils/message-manager';

@Update()
@UseGuards(IsPrivateGuard, IsAdminGuard)
export class AdminWelcomeImageUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Action('set_welcome_image')
    async setWelcomeImage(@Ctx() ctx: Context) {
        const settings = await this.prisma.settings.findFirst();

        let message = '📸 <b>Welcome Image Settings</b>\n\n';

        if (settings?.welcomeImageFileId) {
            message += '✅ Welcome image is set\n\n';
            message += 'Send a new photo to update the welcome image.';
        } else {
            message += '❌ No welcome image set\n\n';
            message += 'Send a photo to set as welcome image.';
        }

        ctx.session.step = 'welcome_image';
        await MessageManager.sendAndRemember(ctx, message, {
            parse_mode: 'HTML',
            ...cancelKeyboard,
        });
        await ctx.answerCbQuery();
    }

    @Action('remove_welcome_image')
    async removeWelcomeImage(@Ctx() ctx: Context) {
        let settings = await this.prisma.settings.findFirst();

        if (!settings) {
            await ctx.answerCbQuery('No settings found', { show_alert: true });
            return;
        }

        await this.prisma.settings.update({
            where: { id: settings.id },
            data: { welcomeImageFileId: null },
        });

        await ctx.answerCbQuery('✅ Welcome image removed', { show_alert: true });

        await MessageManager.deleteRemembered(ctx);
        ctx.session = {};

        await ctx.reply('Welcome image has been removed. The bot will use the default fallback.');
        await ctx.answerCbQuery();
    }

    async handlePhoto(@Ctx() ctx: Context) {
        if (ctx.session.step !== 'welcome_image') return;

        const photo = (ctx.message as any).photo;
        const fileId = photo[photo.length - 1].file_id;

        try {
            let settings = await this.prisma.settings.findFirst();

            if (!settings) {
                settings = await this.prisma.settings.create({
                    data: { welcomeImageFileId: fileId },
                });
            } else {
                await this.prisma.settings.update({
                    where: { id: settings.id },
                    data: { welcomeImageFileId: fileId },
                });
            }

            await MessageManager.deleteRemembered(ctx);
            ctx.session = {};

            // Show preview of the new welcome image
            await ctx.replyWithPhoto(fileId, {
                caption: '✅ <b>Welcome image updated successfully!</b>\n\n<b>Preview:</b>\n🇺🇸 The New World Order App',
                parse_mode: 'HTML',
            });
        } catch (error) {
            await ctx.reply(
                error instanceof Error ? error.message : 'Failed to update welcome image',
                cancelKeyboard,
            );
        }
    }
}
