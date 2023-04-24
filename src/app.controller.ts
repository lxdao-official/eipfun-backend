import { Controller, Get, Post, Query, Logger, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBody, ApiOperation, ApiParam, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { EIPs, EIPType, EIPCategory, EIPStatus, Prisma } from '@prisma/client';
import { EIPBaseDto } from './dto/EIPBase.dto';
import { BusinessException } from './common/business.exception';

export class ResponseData<T> {
  message?: string;
  data: T;
  pagination?: {
    current: number;
    per_page: number;
    total: number;
  };
}

class EIPsSearchFilters {
  @ApiProperty({ description: '', required: false, type: String })
  content?: string;
}

class EIPsFilters {
  @ApiProperty({ description: 'EIP type', required: false, type: String })
  @IsString()
  type?: EIPType;

  @ApiProperty({ description: 'EIP category', required: false, type: String })
  @IsString()
  category?: EIPCategory;

  @ApiProperty({ description: 'EIP status', required: false, type: String })
  @IsString()
  status?: EIPStatus;

  @IsNumber()
  @ApiProperty({ description: 'Page index.', required: false, type: Number })
  page?: number;

  @IsNumber()
  @ApiProperty({
    description: 'Records per page.',
    required: false,
    type: Number,
  })
  per_page?: number;
}

@Controller()
export class AppController {
  private readonly logger = new Logger('App');

  constructor(private readonly appService: AppService) {}

  @Get('/eips/search')
  @ApiOperation({ description: 'Search EIPs.' })
  async search(@Query() filters: EIPsSearchFilters) {
    this.logger.log(filters);
    const result = await this.appService.search();
    return {
      data: result,
    };
  }

  @Get('/eips/list')
  @ApiOperation({ description: 'EIPs list.' })
  async list(
    @Query() filters: EIPsFilters,
  ): Promise<ResponseData<EIPBaseDto[]>> {
    const currentPage = Number(filters.page) || 0;
    const perPage = Number(filters.per_page) || 20;
    const skip = currentPage * perPage;

    const { total, list } = await this.appService.findAll(
      filters.type,
      filters.category,
      filters.status,
      skip,
      perPage,
    );

    return {
      data: list,
      pagination: {
        total,
        current: currentPage,
        per_page: perPage,
      },
    };
  }

  @Get('/eips/update')
  @ApiOperation({ description: 'Updata Eips.' })
  async updateAllEips() {
    const result = await this.appService.updateEips();
    return { data: result };
  }

  @Post('/email/subscribe')
  @ApiOperation({ description: 'Subscribe email.' })
  @ApiBody({
    schema: {
      type: 'object',
      example: { address: 'xxxx@yyy.zz' },
    },
  })
  async subscribeEMail(@Body() body: any) {
    const { address } = body;
    if (!this.appService.isEmail(address)) {
      throw new BusinessException({
        message: 'This email address is invalid.',
        error_code: 'ERROR_INVALID',
      });
    }
    // const status = await this.appService.findSubscribedEMail(address);
    // if (status === 'subscribed') {
    //   throw new BusinessException({
    //     message: 'This email address is already subscribed.',
    //     error_code: 'ERROR_REPEAT',
    //   });
    // }
    const result = await this.appService.subscribeEMail(address);
    return { data: result };
  }

  @Post('/email/ping')
  async pingEMail() {
    const result = await this.appService.pingEMailService();
    return result;
  }

  // @Post('/email/send')
  // async sendEEmail() {
  //   const result = await this.appService.pingEMailService();
  //   return result;
  // }
}
