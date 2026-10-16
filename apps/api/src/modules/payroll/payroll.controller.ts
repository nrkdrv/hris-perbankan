import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { PublishPayrollDto, SimulatePayrollDto } from './dto';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post('import-batch')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importBatch(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: unknown) {
    return this.payroll.importBatch(file, user);
  }

  @Post('simulate')
  @Roles(Role.SUPER_ADMIN)
  simulate(@Body() dto: SimulatePayrollDto) {
    return this.payroll.simulate(dto.periodMonth, dto.rows);
  }

  @Post('publish-period')
  @Roles(Role.SUPER_ADMIN)
  publishPeriod(@Body() dto: PublishPayrollDto, @CurrentUser() user: unknown) {
    return this.payroll.publishPeriod(dto.periodMonth, dto.rows, user);
  }

  @Get('periods')
  @Roles(Role.SUPER_ADMIN)
  periods() {
    return this.payroll.periods();
  }

  @Get('my-payslips')
  myPayslips(@CurrentUser() user: unknown) {
    return this.payroll.myPayslips(user);
  }

  @Get('my-payslips/:id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, periodMonth } = await this.payroll.downloadPdf(id, user, req.ip);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="slip-gaji-${periodMonth}.pdf"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }
}
