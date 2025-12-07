import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Context } from '../interfaces/context.interface';

@Injectable()
export class ActionLoggingMiddleware {
    constructor(private readonly prisma: PrismaService) { }

    async use(ctx: Context, next: () => Promise<void>) {
        const user = ctx.from;

        if (!user || user.id === 777000) {
            return next();
        }

        try {
            // Log message actions
            if (ctx.message && 'text' in ctx.message) {
                const text = ctx.message.text;
                const isCommand = text?.startsWith('/');

                await this.prisma.actionLog.create({
                    data: {
                        userId: ctx.dbUser!.id,
                        username: user.username || null,
                        fullName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
                        actionType: isCommand ? 'command' : 'message',
                        actionData: {
                            text: text,
                            messageId: ctx.message.message_id,
                            chatId: ctx.message.chat.id,
                            sessionStep: ctx.session?.step || null,
                            sessionData: ctx.session?.data || null,
                        },
                    },
                });
            }

            // Log callback query actions
            if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
                await this.prisma.actionLog.create({
                    data: {
                        userId: ctx.dbUser!.id,
                        username: user.username || null,
                        fullName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
                        actionType: 'callback',
                        actionData: {
                            callbackData: ctx.callbackQuery.data,
                            messageId: ctx.callbackQuery.message?.message_id,
                            chatId: ctx.callbackQuery.message
                                ? 'chat' in ctx.callbackQuery.message
                                    ? ctx.callbackQuery.message.chat.id
                                    : undefined
                                : undefined,
                            sessionStep: ctx.session?.step || null,
                            sessionData: ctx.session?.data || null,
                        },
                    },
                });
            }

            // Log photo uploads
            if (ctx.message && 'photo' in ctx.message) {
                await this.prisma.actionLog.create({
                    data: {
                        userId: ctx.dbUser!.id,
                        username: user.username || null,
                        fullName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
                        actionType: 'photo',
                        actionData: {
                            photoCount: ctx.message.photo.length,
                            fileId: ctx.message.photo[ctx.message.photo.length - 1].file_id,
                            messageId: ctx.message.message_id,
                            chatId: ctx.message.chat.id,
                            sessionStep: ctx.session?.step || null,
                        },
                    },
                });
            }

            return next();
        } catch (error) {
            // Log error
            await this.prisma.actionLog.create({
                data: {
                    userId: ctx.dbUser?.id || 0,
                    username: user.username || null,
                    fullName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
                    actionType: 'error',
                    errorMessage: error instanceof Error ? error.message : String(error),
                },
            });

            throw error;
        }
    }
}
