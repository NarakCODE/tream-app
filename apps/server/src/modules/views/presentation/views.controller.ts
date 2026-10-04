import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { ViewService } from '../application/view.service';
import {
  CreateFavoriteDto,
  CreateViewDto,
  QueryViewDto,
  ReorderFavoritesDto,
  SearchDto,
  UpdateViewDto,
  ViewListDto,
  ViewPaginationDto,
  ViewRevisionDto,
} from './view.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Views and search')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class ViewsController {
  constructor(private readonly service: ViewService) {}
  @Get('views') list(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Query() query: ViewListDto,
  ) {
    return this.service.list(req.user.id, w, query);
  }
  @Post('views') @TransactionalCommand() create(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Body() dto: CreateViewDto,
  ) {
    return this.service.create(req.commandIdentity, w, dto);
  }
  @Post('views/query') @HttpCode(200) query(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Body() dto: QueryViewDto,
  ) {
    return this.service.query(req.user.id, w, dto);
  }
  @Get('views/:viewId') get(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
  ) {
    return this.service.get(req.user.id, w, id);
  }
  @Get('views/:viewId/results') results(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
    @Query() dto: ViewPaginationDto,
  ) {
    return this.service.querySaved(req.user.id, w, id, dto.limit, dto.cursor);
  }
  @Patch('views/:viewId') @TransactionalCommand() update(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
    @Body() dto: UpdateViewDto,
  ) {
    return this.service.update(req.commandIdentity, w, id, dto);
  }
  @Post('views/:viewId/archive') @HttpCode(200) @TransactionalCommand() archive(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
    @Body() dto: ViewRevisionDto,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      w,
      id,
      dto.expectedRevision,
      'archive',
    );
  }
  @Delete('views/:viewId') @TransactionalCommand() remove(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
    @Body() dto: ViewRevisionDto,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      w,
      id,
      dto.expectedRevision,
      'delete',
    );
  }
  @Post('views/:viewId/restore') @HttpCode(200) @TransactionalCommand() restore(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('viewId') id: string,
    @Body() dto: ViewRevisionDto,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      w,
      id,
      dto.expectedRevision,
      'restore',
    );
  }
  @Get('favorites') favorites(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Query() dto: ViewPaginationDto,
  ) {
    return this.service.favorites(req.user.id, w, dto.limit, dto.cursor);
  }
  @Post('favorites') @TransactionalCommand() favorite(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Body() dto: CreateFavoriteDto,
  ) {
    return this.service.addFavorite(req.commandIdentity, w, dto);
  }
  @Post('favorites/reorder') @HttpCode(200) @TransactionalCommand() reorder(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Body() dto: ReorderFavoritesDto,
  ) {
    return this.service.reorderFavorites(req.commandIdentity, w, dto);
  }
  @Delete('favorites/:favoriteId') @TransactionalCommand() unfavorite(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Param('favoriteId') id: string,
    @Body() dto: ViewRevisionDto,
  ) {
    return this.service.removeFavorite(
      req.commandIdentity,
      w,
      id,
      dto.expectedRevision,
    );
  }
  @Get('search') search(
    @Req() req: Request,
    @Param('workspaceId') w: string,
    @Query() dto: SearchDto,
  ) {
    return this.service.search(req.user.id, w, dto);
  }
}
