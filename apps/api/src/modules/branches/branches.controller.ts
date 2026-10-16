import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AuthUser } from '../auth/jwt.strategy';

/** Tanpa @Roles → semua peran yang sudah login boleh membaca. */
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  findAll(): Promise<unknown[]> {
    return this.branches.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<unknown> {
    return this.branches.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.branches.create(dto, actor, req);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.branches.update(id, dto, actor, req);
  }
}
