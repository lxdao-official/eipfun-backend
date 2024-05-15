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
      `SELECT id, eip, title, author, status, type, category FROM "EIPs" ${condition} order by (substring("eip", '^[0-9]+'))::int LIMIT ${take} OFFSET ${skip}`,
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
      if (this.isNumeric(content)) {
        const eipRecords = await this.connection.query(
          `SELECT eip, title, type, category FROM "EIPs" WHERE eip='${content}'`,
        );
        if (eipRecords && eipRecords.length > 0) {
          result['eip_list'] = eipRecords;
        }
      } else {
        // title match
        const titleRecords = await this.connection.query(
          `SELECT eip, type, category, ts_headline('english',title, q), rank FROM (SELECT eip, type, category, title, q, ts_rank_cd(title_ts, q) AS rank FROM "EIPs", phraseto_tsquery('english','${content}') q WHERE title_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );

        if (titleRecords && titleRecords.length > 0) {
          result['title_list'] = titleRecords;
        }

        // content match
        const contentRecords = await this.connection.query(
          `SELECT eip, type, category, title, ts_headline('english',content, q), rank FROM (SELECT eip, type, category, title, content, q, ts_rank_cd(content_ts, q) AS rank FROM "EIPs", phraseto_tsquery('english','${content}') q WHERE content_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
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

  async downloadErcs() {
    const paths = './ETH-ERCS/';
    deleteFolder(paths);
    return new Promise(function (res, rej) {
      download(
        'direct:https://github.com/ethereum/ERCs.git',
        'ETH-ERCS',
        { clone: true },
        function (err) {
          if (err) {
            rej(err);
          } else {
            res('download ERC success!');
            console.log('下载完成');
          }
        },
      );
    });
  }

  async updateEips() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    const paths = './ETH-EIPs/';
    console.log('开始清理文件夹');
    deleteFolder(paths);
    console.log('清理文件夹成功');
    await this.downloadErcs();
    download(
      'direct:https://github.com/ethereum/EIPs.git',
      'ETH-EIPs',
      { clone: true },
      (err) => {
        console.log(err ? '拉取Error' : '拉取Success');
        if (!err) {
          const writeData = [];
          const directory = './ETH-EIPs/EIPS/';
          fs.readdir(directory, (err, files) => {
            if (err) {
              console.error(err);
              return;
            }
            (async function getFileMeta(i) {
              console.log(i, files.length);

              if (i === files.length) {
                console.log('解析EIPS文件完成');
                await that.saveData(writeData);
                console.log('写入DB完成');
              } else {
                fs.readFile(
                  path.join(directory, files[i]),
                  'utf8',
                  (err, data) => {
                    if (err) {
                      console.log('读取文件失败', err);
                      return;
                    }
                    const result = that.formateData(data);
                    if (result.status !== 'Moved') {
                      writeData.push(result);
                    } else {
                      const ercDirectory = './ETH-ERCS/ERCS/';
                      const id = files[i].split('-')[1];
                      const fsInfo = fs.readFileSync(
                        path.join(ercDirectory, `erc-${id}`),
                        'utf8',
                      );
                      const ercData = that.formateData(fsInfo);
                      writeData.push(ercData);
                    }

                    getFileMeta(i + 1);
                  },
                );
              }
            })(0);
          });
        } else {
          // console.log(err);
          deleteFolder(paths);
        }
      },
    );
  }

  async sendEmail() {
    const response = await mailchimp.ping.get();
    return response;
  }

  async saveData(writeData: EIPs[]) {
    try {
      // console.log(writeData.length);
      await this.prisma.eIPs.deleteMany({});
      // for (const item of writeData) {
      //   console.log('item:', item);
      //   await this.prisma.eIPs.create({ data: item });
      // }
      await this.prisma.eIPs.createMany({
        data: writeData,
      });
    } catch (err) {
      console.log(err);
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleCheckUpdate() {
    await this.updateEips();
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
