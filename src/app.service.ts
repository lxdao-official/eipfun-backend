import { ConsoleLogger, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EIPs, EIPType, EIPCategory, Prisma } from '@prisma/client';
import * as mailchimp from '@mailchimp/mailchimp_marketing';
import * as md5 from 'md5';
const fs = require('fs');
const download = require('download-git-repo');
const path = require('path');
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
  async showAll() {
    const list = await this.prisma.eIPs.findMany();

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
    let that = this;
    const paths = './ETH-EIPs/';
    console.log('开始清理文件夹');
    // deleteFolder(paths);
    console.log('清理文件夹成功');
    download(
      'direct:https://github.com/ethereum/EIPs.git',
      'ETH-EIPs',
      { clone: true },
      (err) => {
        console.log(err ? '拉取Error' : '拉取Success');
        if (!err) {
          let writeData = [];
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
              } else {
                fs.readFile(
                  path.join(directory, files[i]),
                  'utf8',
                  (err, data) => {
                    if (err) {
                      console.log('读取文件失败', err);
                      return;
                    }
                    let metaInfo = data.split('---')[1];
                    let lines = metaInfo.split('\n');
                    //默认值填充
                    let result = <EIPs>{
                      id: null,
                      eip: null,
                      title: '',
                      description: '',
                      status: 'Living',
                      'discussions_to': null,
                      author: '',
                      content: '',
                      extension_sub_title: null,
                      extension_short_read: null,
                      createdAt: new Date(),
                      updatedAt:  new Date(),
                      type: 'Standards_Track',
                      category: 'Core',
                      requires:[],
                      created: undefined,
                      last_call_deadline: undefined,
                      withdrawal_reason: null,
                    };
                    for (let q = 0; q < lines.length; q++) {
                      let parts = lines[q].split(': ');
                      if (parts[0]) {
                        if (parts[0] === 'eip') {
                          result[parts[0]] = parts[1] * 1;
                          result['id'] = parts[1] * 1;
                        } else if (parts[0] === 'requires') {
                          result[parts[0]] = parts[1].split(', ');
                        } else if (parts[0] === 'type') {
                          result[parts[0]] = parts[1];
                          if (parts[1] === 'Standards Track') {
                            result[parts[0]] = 'Standards_Track';
                          }
                        } else if (
                          parts[0] === 'created' ||
                          parts[0] === 'last_call_deadline'
                        ) {
                          result[parts[0]] = new Date(parts[1]);
                        } else {
                          result[parts[0]] = parts[1];
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
    console.log(writeData.length);
    await this.prisma.eIPs.deleteMany({});

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
