import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPType, EIPCategory, Prisma } from '@prisma/client';

import * as mailchimp from '@mailchimp/mailchimp_marketing';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: 'us17',
    });
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
      select: {
        id: true,
        eip: true,
        title: true,
        author: true,
        status: true,
        type: true,
      },
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

  async pingEmailService() {
    const response = await mailchimp.ping.get();
    console.log('mailchimp ping:', response);

    return response;
  }

  async sendEmail() {
    const response = await mailchimp.ping.get();
    return response;
  }
}
