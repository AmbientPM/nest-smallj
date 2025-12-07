import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Context } from '../interfaces/context.interface';

@Injectable()
export class UserMiddleware {
    private readonly logger = new Logger(UserMiddleware.name);

    constructor(private readonly prisma: PrismaService) { }

    async use(ctx: Context, next: () => Promise<void>) {
        const user = ctx.from;

        if (!user || user.id === 777000) {
            return next();
        }

        this.logger.log(`Processing user: ${user.id} - ${user.username || user.first_name}`);

        let dbUser = await this.prisma.user.findUnique({
            where: { telegramId: user.id },
        });

        if (!dbUser) {
            dbUser = await this.prisma.user.create({
                data: {
                    telegramId: user.id,
                    telegramUsername: user.username || null,
                    telegramName: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
                },
            });
            this.logger.log(`Created new user: ${dbUser.id}`);
        } else {
            const fullName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');

            if (user.username !== dbUser.telegramUsername || fullName !== dbUser.telegramName) {
                dbUser = await this.prisma.user.update({
                    where: { id: dbUser.id },
                    data: {
                        telegramUsername: user.username || null,
                        telegramName: fullName,
                    },
                });
            }
        }

        ctx.dbUser = dbUser;

        return next();
    }
}
