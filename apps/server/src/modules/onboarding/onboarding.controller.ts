import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../common/decorators/transactional-command.decorator';
import { RequireWorkspacePermission } from '../iam/workspaces/presentation/workspace-permission.guard';
import { OnboardingService } from './onboarding.service';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller()
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Get('bootstrap')
  @Header('Cache-Control', 'no-store')
  bootstrap(@Req() request: Request) {
    return this.service.bootstrap(request.user.id);
  }
  @Post('workspaces/:workspaceId/onboarding/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @TransactionalCommand()
  @RequireWorkspacePermission('workspace.read')
  complete(
    @Req() request: Request,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.service.complete(request.commandIdentity, workspaceId);
  }
}
