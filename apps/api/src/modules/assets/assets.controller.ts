import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto, HandoverDto, ListAssetsQueryDto, UpdateConditionDto } from './dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: unknown) {
    return this.assets.create(dto, user);
  }

  @Get()
  list(@Query() query: ListAssetsQueryDto) {
    return this.assets.list(query);
  }

  // Didefinisikan SEBELUM ':id' agar tidak tertelan parameter.
  @Get('scan/:assetCode')
  scanByCode(@Param('assetCode') assetCode: string) {
    return this.assets.scanByCode(assetCode);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.assets.getById(id);
  }

  @Get(':id/qr')
  async qr(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const png = await this.assets.qrPng(id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.send(png);
  }

  @Patch(':id/condition')
  @Roles(Role.SUPER_ADMIN)
  updateCondition(
    @Param('id') id: string,
    @Body() dto: UpdateConditionDto,
    @CurrentUser() user: unknown,
  ) {
    return this.assets.updateCondition(id, dto, user);
  }

  @Post(':id/handover')
  @Roles(Role.SUPER_ADMIN)
  handover(@Param('id') id: string, @Body() dto: HandoverDto, @CurrentUser() user: unknown) {
    return this.assets.handover(id, dto, user);
  }
}
