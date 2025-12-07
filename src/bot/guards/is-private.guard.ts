import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import type { Context } from '../interfaces/context.interface';

@Injectable()
export class IsPrivateGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const ctx = TelegrafExecutionContext.create(context);
        const { chat } = ctx.getContext<Context>();

        return chat?.type === 'private';
    }
}
