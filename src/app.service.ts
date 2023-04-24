import { ConsoleLogger, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPStatus, EIPType, EIPCategory, Prisma } from '@prisma/client';
import * as mailchimp from '@mailchimp/mailchimp_marketing';
import * as md5 from 'md5';
import * as fs from 'fs';
import * as download from 'download-git-repo';
import * as path from 'path';

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
    status?: EIPStatus,
    skip?: number,
    take?: number,
  ) {
    const where = {
      type: type,
      category: category,
    };
    if (type) {
      where['type'] = type;
    }
    if (category) {
      where['category'] = category;
    }
    if (status) {
      where['status'] = status;
    }
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
      orderBy: {
        eip: Prisma.SortOrder.asc,
      },
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

  async search() {
    const list = await this.prisma.$queryRaw``;

    return {
      list,
    };
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

  async updateEips() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    const paths = './ETH-EIPs/';
    console.log('开始清理文件夹');
    deleteFolder(paths);
    console.log('清理文件夹成功');
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
            (function getFileMeta(i) {
              if (i === files.length) {
                console.log('解析EIPS文件完成');
                that.saveData(writeData);
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
                      const value: string = parts[1];
                      if (field) {
                        if (field === 'eip') {
                          result['eip'] = value;
                        } else if (field === 'requires') {
                          result[field] = value.split(', ').map((eip) => {
                            return Number(eip);
                          });
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
                    writeData.push(result);
                    getFileMeta(i + 1);
                  },
                );
              }
            })(0);
          });
        } else {
          console.log(err);
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
    // console.log(writeData.length);
    await this.prisma.eIPs.deleteMany({});
    // for (const item of writeData) {
    //   console.log('item:', item);
    //   await this.prisma.eIPs.create({ data: item });
    // }
    await this.prisma.eIPs.createMany({
      data: writeData,
    });
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
