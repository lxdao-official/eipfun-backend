import { ConsoleLogger, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPStatus, EIPType, EIPCategory, Prisma } from '@prisma/client';
import * as mailchimp from '@mailchimp/mailchimp_marketing';
import * as md5 from 'md5';
import * as fs from 'fs';
import * as download from 'download-git-repo';
import * as path from 'path';

import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AppService {
  constructor(
    private prisma: PrismaService,
    @InjectDataSource() private readonly connection: DataSource,
  ) {
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: 'us17',
    });
  }

  async findAll(
    type?: EIPType,
    category?: EIPCategory,
    status?: EIPStatus,
    skip?: number,
    take?: number,
  ) {
    let condition = '';
    const where = {};
    if (type) {
      where['type'] = type;
      condition += `type='${type}' `;
    }
    if (category) {
      where['category'] = category;
      condition +=
        condition.length > 0
          ? `and category='${category}' `
          : `category='${category}' `;
    }
    if (status) {
      where['status'] = status;

      let replace: string = status;
      if (replace === EIPStatus.Last_Call) {
        replace = 'Last Call';
      }
      condition +=
        condition.length > 0
          ? `and status='${replace}' `
          : `status='${replace}' `;
    }
    if (condition.length > 0) {
      condition = `WHERE ${condition}`;
    }

    const total = await this.prisma.eIPs.count({
      where: where,
    });

    const list = await this.connection.query(
      `SELECT id, eip, title, author, status, type, category FROM "EIPs" ${condition} order by eip LIMIT ${take} OFFSET ${skip}`,
    );

    return {
      total,
      list,
    };
  }

  isNumeric(str: any) {
    if (typeof str != 'string') return false;
    return !isNaN(Number(str)) && !isNaN(parseFloat(str));
  }

  async search(content: string) {
    try {
      const result = {};
      // eip match
      const numbers = content.match(/\d+/g) || [];
      const texts = content.match(/\D+/g) || [];
      const txt = texts.length ? texts.join(' ').trim() : '';
      const eips = [];
      let eipCondition = '';
      if (numbers && numbers.length) {
        numbers.forEach((item) => {
          if (Number(item) < 10000) {
            // eip number don't overt 10000
            eips.push(`eip::text LIKE '%${item}%'`);
          }
        });
        if (eips.length === 1) {
          eipCondition = eips[0];
        } else {
          eipCondition = eips.join(' OR ');
        }
      }

      if (eips?.length && !txt) {
        const eipRecords = await this.connection.query(
          `SELECT eip, title, type, category FROM "EIPs" WHERE ${eipCondition}`,
        );
        if (eipRecords && eipRecords.length > 0) {
          result['eip_list'] = eipRecords;
        }
      } else {
        // title match
        const conditions = eips.length ? `${eipCondition} AND` : ``;
        const titleRecords = await this.connection.query(
          `SELECT eip, type, category, ts_headline('english',title, q), rank FROM (SELECT eip, type, category, title, q, ts_rank_cd(to_tsvector(title_ts), q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} title_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );

        if (titleRecords && titleRecords.length > 0) {
          result['title_list'] = titleRecords;
        }

        // author match
        const authorRecords = await this.connection.query(
          `SELECT eip, type, category, ts_headline('english', author, q), rank FROM (SELECT eip, type, category, author, q, ts_rank_cd(to_tsvector(author_ts), q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} author_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );

        if (authorRecords && authorRecords.length > 0) {
          result['author_list'] = authorRecords;
        }

        // content match
        const contentRecords = await this.connection.query(
          `SELECT eip, type, category, title, ts_headline('english',content, q), rank FROM (SELECT eip, type, category, title, content, q, ts_rank_cd(to_tsvector(content_ts), q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} content_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );
        if (contentRecords && contentRecords.length > 0) {
          result['content_list'] = contentRecords;
        }
      }
      return result;
    } catch (err) {
      console.log(err);
    }
  }

  isEmail(email): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailPattern.test(email)) {
      return true;
    }
    return false;
  }

  async pingEMailService() {
    const response = await mailchimp.ping.get();
    console.log('mailchimp ping:', response);

    return response;
  }

  async findSubscribedEMail(email: string) {
    try {
      const subscriberHash = md5(email.toLowerCase());

      const response = await mailchimp.lists.getListMember(
        process.env.MAILCHIMP_AUDIENCE_ID,
        subscriberHash,
      );

      return response.status;
    } catch (e) {
      if (e.status === 404) {
        console.error(`This email is not subscribed to this list`, e);
      }
    }

    // const entity = await this.prisma.emailSubscribe.findFirst({
    //   where: {
    //     address: {
    //       equals: address,
    //     },
    //   },
    // });

    // return entity;
  }

  async subscribeEMail(email: string) {
    // // add new
    // const add_response = await mailchimp.lists.addListMember(listId, {
    //   email_address: email,
    //   status: 'subscribed',
    // });

    // add new or update
    const subscriberHash = md5(email.toLowerCase());
    const add_update_response = await mailchimp.lists.setListMember(
      process.env.MAILCHIMP_AUDIENCE_ID,
      subscriberHash,
      { email_address: email, status_if_new: 'subscribed' },
    );

    return add_update_response;
  }

  formateData(data: any) {
    const metaInfo = data.split('---')[1];
    const content = data.split('---')[2];
    const lines = metaInfo.split('\n');
    //默认值填充
    const result = <EIPs>{
      eip: null,
      title: '',
      description: '',
      status: null,
      discussions_to: null,
      author: '',
      content: content,
      extension_sub_title: null,
      extension_short_read: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      type: null,
      category: null,
      requires: [],
      created: null,
      last_call_deadline: null,
      withdrawal_reason: null,
    };
    for (let q = 0; q < lines.length; q++) {
      const parts = lines[q].split(': ');
      const field: string = parts[0];
      let value: string = parts[1];
      //兼容value中包含:的情况
      if (parts.length > 2) {
        value = parts.slice(1).join(': ');
      }
      if (field) {
        if (field === 'eip') {
          result['eip'] = value;
        } else if (field === 'requires') {
          result[field] = value.split(', ').map((eip) => {
            return Number(eip);
          });
        } else if (field === 'title') {
          result[field] = value.replace(/^\"|\"$/g, '');
        } else if (field === 'type') {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          result[field] = value;
          if (value === 'Standards Track') {
            result[field] = EIPType.Standards_Track;
          }
        } else if (field === 'status') {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          result[field] = value;
          if (value === 'Last Call') {
            result[field] = EIPStatus.Last_Call;
          }
        } else if (field === 'created') {
          result[field] = new Date(value);
        } else if (field === 'last-call-deadline') {
          result['last_call_deadline'] = new Date(value);
        } else if (field === 'discussions-to') {
          result['discussions_to'] = value;
        } else if (field === 'withdrawal-reason') {
          result['withdrawal_reason'] = value;
        } else {
          if (field === 'updated') {
          } else {
            result[field] = value;
          }
        }
      }
    }
    return result;
  }

  async downloadEips() {
    const paths = './ETH-EIPs/';
    deleteFolder(paths);
    return new Promise(function (res, rej) {
      download(
        'direct:https://github.com/ethereum/EIPs.git',
        'ETH-EIPs',
        { clone: true },
        function (err) {
          if (err) {
            rej(err);
          } else {
            res('download EIP success!');
            console.log('download EIP success!');
          }
        },
      );
    });
  }

  async downloadErcs() {
    const paths = './ETH-ERCs/';
    deleteFolder(paths);
    return new Promise(function (res, rej) {
      download(
        'direct:https://github.com/ethereum/ERCs.git',
        'ETH-ERCs',
        { clone: true },
        function (err) {
          if (err) {
            rej(err);
          } else {
            res('download ERC success!');
            console.log('download ERC success!');
          }
        },
      );
    });
  }

  async updateData() {
    const writeData = [];
    const directory = './ETH-EIPs/EIPS/';
    const ercDirectory = './ETH-ERCs/ERCS/';
    // erc
    const getArr = async (path: string, type: 'eip' | 'erc') => {
      let files;
      try {
        files = await fs.promises.readdir(path);
      } catch (err) {
        console.error(err);
        return [];
      }
      return files.map((f) => f.replace(type + '-', ''));
    };

    const eipArr = await getArr(directory, 'eip');
    const ercArr = await getArr(ercDirectory, 'erc');
    const ercNew = ercArr.filter((item) => !eipArr.includes(item));
    ercNew.shift();
    ercNew.forEach(async (item) => {
      let fileInfo;
      try {
        fileInfo = fs.readFileSync(
          path.join(ercDirectory, `erc-${item}`),
          'utf8',
        );
        const ercData = this.formateData(fileInfo);
        writeData.push(ercData);
      } catch (err) {
        console.error(err);
      }
    });

    let eipFiles;
    try {
      eipFiles = await fs.promises.readdir(directory);
      if (eipFiles.length === 0) {
        return;
      }

      eipFiles.forEach(async (file) => {
        try {
          const fileInfo = fs.readFileSync(path.join(directory, file), 'utf8');
          const result = this.formateData(fileInfo);
          if (result.status !== 'Moved') {
            writeData.push(result);
          } else {
            const id = file.split('-')[1];
            try {
              const ercInfo = fs.readFileSync(
                path.join(ercDirectory, `erc-${id}`),
                'utf8',
              );
              if (ercInfo) {
                const ercData = this.formateData(ercInfo);
                writeData.push(ercData);
              }
            } catch (err) {
              console.error(err);
            }
          }
        } catch (e) {
          console.error(e);
        }
      });
    } catch (err) {
      console.error(err);
    }
    console.log(writeData.length);

    await this.saveData(writeData);
    return 'update success!';
  }

  async sendEmail() {
    const response = await mailchimp.ping.get();
    return response;
  }

  async saveData(writeData: EIPs[]) {
    try {
      await this.prisma.eIPs.deleteMany({});

      for (const item of writeData) {
        // 确保 requires 字段是数字数组
        const formattedItem = {
          ...item,
          requires: Array.isArray(item.requires)
            ? item.requires.map((r) =>
                typeof r === 'number' ? r : parseInt(r),
              )
            : [],
        };

        await this.prisma.eIPs.create({
          data: formattedItem,
        });
      }
    } catch (err) {
      console.error('Error saving data:', err);
      throw err;
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleCheckUpdate() {
    await this.downloadErcs();
    await this.downloadEips();
    await this.updateData();
  }
}

function deleteFolder(filePath) {
  const files = [];
  if (fs.existsSync(filePath)) {
    const files = fs.readdirSync(filePath);
    files.forEach((file) => {
      const nextFilePath = `${filePath}/${file}`;
      const states = fs.statSync(nextFilePath);
      if (states.isDirectory()) {
        //recurse
        deleteFolder(nextFilePath);
      } else {
        //delete file
        fs.unlinkSync(nextFilePath);
      }
    });
    fs.rmdirSync(filePath);
  }
}
