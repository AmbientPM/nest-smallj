import { Context as TelegrafContext, Scenes } from 'telegraf';

export interface SessionData {
    step?: string;
    data?: Record<string, any>;
}

export interface Context extends TelegrafContext {
    session: SessionData;
    dbUser?: {
        id: number;
        telegramId: bigint;
        telegramUsername: string | null;
        telegramName: string;
        xlmBalance: number;
        createdAt: Date;
        updatedAt: Date;
    };
}
