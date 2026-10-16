import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../auth/jwt.strategy';

class ListUsersQuery {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListUsersQuery,
  ): Promise<unknown[]> {
    return this.users.findAll(actor, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<unknown> {
    return this.users.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.users.create(dto, actor, req);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.users.update(id, dto, actor, req);
  }

  @Post(':id/deactivate')
  @Roles(Role.SUPER_ADMIN)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.users.setActive(id, false, actor, req);
  }

  @Post(':id/activate')
  @Roles(Role.SUPER_ADMIN)
  activate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.users.setActive(id, true, actor, req);
  }
}
