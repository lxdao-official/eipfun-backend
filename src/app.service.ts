import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPType, EIPCategory, Prisma } from '@prisma/client';
// import * from '@mailchimp/mailchimp_transactional';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mailchimpTx = require('@mailchimp/mailchimp_transactional')(
  process.env.MAILCHIMP_API_KEY,
);

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

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
    const response = await mailchimpTx.users.ping();
    return response;
  }

  async sendEmail() {
    const response = await mailchimpTx.users.ping();
    return response;
  }

  async handleSendEIPsUpdateEmail() {}
}
