import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import type { Context } from '../interfaces/context.interface';

@Injectable()
export class IsAdminGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const ctx = TelegrafExecutionContext.create(context);
        const { from } = ctx.getContext<Context>();

        const adminIds = this.configService
            .get<string>('ADMIN_IDS')!
            .split(',')
            .map((id) => parseInt(id.trim()));

        return adminIds.includes(from?.id!);
    }
}
