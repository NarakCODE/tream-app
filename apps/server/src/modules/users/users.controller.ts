import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { ApiStandardResponse } from '../../common/decorators/api-standard-response.decorator';
import type { PaginatedResult } from '../../common/interfaces/api-response.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an in-memory user' })
  @ApiStandardResponse(UserResponseDto, HttpStatus.CREATED)
  create(@Body() input: CreateUserDto): UserResponseDto {
    return UserResponseDto.fromEntity(this.usersService.create(input));
  }

  @Get()
  @ApiOperation({
    summary: 'List users with pagination, filtering, and sorting',
  })
  @ApiPaginatedResponse(UserResponseDto)
  findAll(@Query() query: QueryUsersDto): PaginatedResult<UserResponseDto> {
    const result = this.usersService.findAll(query);
    return {
      ...result,
      items: result.items.map((user) => UserResponseDto.fromEntity(user)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by identifier' })
  @ApiStandardResponse(UserResponseDto)
  findOne(@Param('id') id: string): UserResponseDto {
    return UserResponseDto.fromEntity(this.usersService.findOne(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user by identifier' })
  @ApiStandardResponse(UserResponseDto)
  update(
    @Param('id') id: string,
    @Body() input: UpdateUserDto,
  ): UserResponseDto {
    return UserResponseDto.fromEntity(this.usersService.update(id, input));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user by identifier' })
  @ApiNoContentResponse({ description: 'User removed.' })
  remove(@Param('id') id: string): void {
    this.usersService.remove(id);
  }
}
