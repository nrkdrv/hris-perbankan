import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LettersService } from './letters.service';
import { ExpeditionBookQueryDto, GenerateNumberDto } from './dto';

@Controller('letters')
export class LettersController {
  constructor(private readonly letters: LettersService) {}

  @Post('generate-number')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.OFFICE_EMPLOYEE, Role.FIELD_EMPLOYEE)
  generateNumber(@Body() dto: GenerateNumberDto, @CurrentUser() user: unknown) {
    return this.letters.generateNumber(dto, user);
  }

  @Post(':id/upload-scan')
  @UseInterceptors(
    FileInterceptor('pdf', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') return cb(null, true);
        return cb(new BadRequestException('Hanya file application/pdf yang diizinkan'), false);
      },
    }),
  )
  uploadScan(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: unknown,
  ) {
    return this.letters.uploadScan(id, file, user);
  }

  @Get('expedition-book')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  expeditionBook(@Query() query: ExpeditionBookQueryDto) {
    return this.letters.expeditionBook(query);
  }

  @Get('me')
  myLetters(@CurrentUser() user: unknown) {
    return this.letters.myLetters(user);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: unknown) {
    return this.letters.getById(id, user);
  }
}
