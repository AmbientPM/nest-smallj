import type { Context } from '../interfaces/context.interface';

export class MessageManager {
    /**
     * Delete a message safely (catches errors if message was already deleted)
     */
    static async safeDelete(ctx: Context, messageId?: number) {
        try {
            if (messageId) {
                await ctx.telegram.deleteMessage(ctx.chat!.id, messageId);
            } else {
                await ctx.deleteMessage();
            }
        } catch (error) {
            // Ignore errors (message might already be deleted)
        }
    }

    /**
     * Edit message or send new one if edit fails
     */
    static async editOrSend(
        ctx: Context,
        text: string,
        extra?: any,
    ) {
        try {
            if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
                await ctx.editMessageText(text, extra);
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(text, extra);
            }
        } catch (error: any) {
            // If message is not modified or can't be edited, send new message
            if (error?.message?.includes('message is not modified') ||
                error?.message?.includes('message to edit not found')) {
                await ctx.answerCbQuery?.();
            } else {
                // Send new message if edit failed
                await ctx.reply(text, extra);
                await ctx.answerCbQuery?.();
            }
        }
    }

    /**
     * Send a message and remember it for later deletion
     */
    static async sendAndRemember(
        ctx: Context,
        text: string,
        extra?: any,
    ) {
        const sentMessage = await ctx.reply(text, extra);

        // Store message ID in session for later deletion
        if (!ctx.session.data) {
            ctx.session.data = {};
        }
        if (!ctx.session.data.messagesToDelete) {
            ctx.session.data.messagesToDelete = [];
        }
        ctx.session.data.messagesToDelete.push(sentMessage.message_id);

        return sentMessage;
    }

    /**
     * Delete all remembered messages
     */
    static async deleteRemembered(ctx: Context) {
        const messageIds = ctx.session.data?.messagesToDelete || [];

        for (const messageId of messageIds) {
            await this.safeDelete(ctx, messageId);
        }

        // Clear the list
        if (ctx.session.data) {
            ctx.session.data.messagesToDelete = [];
        }
    }

    /**
     * Clear session and delete remembered messages
     */
    static async clearSessionAndMessages(ctx: Context) {
        await this.deleteRemembered(ctx);
        ctx.session = {};
    }
}
