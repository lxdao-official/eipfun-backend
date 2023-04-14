import { Controller, Get, Query, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { EIPs, EIPType, EIPCategory, Prisma } from '@prisma/client';
import { EIPBaseDto } from './dto/EIPBase.dto';

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
  type?: EIPType;

  @ApiProperty({ description: 'EIP category', required: false, type: String })
  category?: EIPCategory;

  @IsInt()
  @Type(() => Number)
  @ApiProperty({ description: 'Page index.', required: false, type: Number })
  page?: number;

  @IsInt()
  @Type(() => Number)
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
    return this.appService.getHello();
  }

  @Get('/eips/list')
  @ApiOperation({ description: 'EIPs list.' })
  async list(
    @Query() filters: EIPsFilters,
  ): Promise<ResponseData<EIPBaseDto[]>> {
    this.logger.log(filters);

    const currentPage = filters.page || 1;
    const perPage = filters.per_page || 20;
    const skip = (currentPage - 1) * perPage;

    const { total, list } = await this.appService.findAll(
      filters.type,
      filters.category,
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
}
