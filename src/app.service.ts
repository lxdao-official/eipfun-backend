import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPType, EIPCategory, Prisma } from '@prisma/client';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async findAll(
    type?: EIPType,
    category?: EIPCategory,
    skip?: number,
    take?: number,
  ) {
    const where = {
      type: type,
      category: category,
    };
    const find = {
      where,
      skip: skip,
      take: take,
    };

    const total = await this.prisma.eIPs.count({
      where: where,
    });

    const list = await this.prisma.eIPs.findMany(find);

    return {
      total,
      list,
    };
  }
}
