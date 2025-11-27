import { ConsoleLogger, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  EIPs,
  EIPStatus,
  EIPType,
  EIPCategory,
  Prisma,
  WhitelistSource,
} from '@prisma/client';
import * as mailchimp from '@mailchimp/mailchimp_marketing';
import * as md5 from 'md5';
import * as fs from 'fs';
import * as download from 'download-git-repo';
import * as path from 'path';
import { MerkleTree } from 'merkletreejs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import keccak256 = require('keccak256');

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
    this.allowedSources = this.parseAllowedSources();
  }

  private merkleCache: Map<number, { tree: MerkleTree; root: string }> =
    new Map();
  private allowedSources: WhitelistSource[] | null = null;

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

  private normalizeAddress(address: string): string | null {
    if (!address || typeof address !== 'string') return null;
    const lower = address.toLowerCase();
    const isHex = /^0x[a-f0-9]{40}$/i.test(address);
    return isHex ? lower : null;
  }

  private parseAllowedSources(): WhitelistSource[] | null {
    const raw = process.env.WHITELIST_SOURCES;
    if (!raw) return null;
    const arr = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s as keyof typeof WhitelistSource)
      .filter((s) => WhitelistSource[s] !== undefined)
      .map((s) => WhitelistSource[s]);
    return arr.length ? arr : null;
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
            eips.push(`eip LIKE '%${item}%'`);
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
          `SELECT eip, type, category, ts_headline('english',title, q), rank FROM (SELECT eip, type, category, title, q, ts_rank_cd(title_ts, q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} title_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );

        if (titleRecords && titleRecords.length > 0) {
          result['title_list'] = titleRecords;
        }

        // author match
        const authorRecords = await this.connection.query(
          `SELECT eip, type, category, ts_headline('english', author, q), rank FROM (SELECT eip, type, category, author, q, ts_rank_cd(author_ts, q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} author_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
        );

        if (authorRecords && authorRecords.length > 0) {
          result['author_list'] = authorRecords;
        }

        // content match
        const contentRecords = await this.connection.query(
          `SELECT eip, type, category, title, ts_headline('english',content, q), rank FROM (SELECT eip, type, category, title, content, q, ts_rank_cd(content_ts, q) AS rank FROM "EIPs", phraseto_tsquery('english','${txt}') q WHERE ${conditions} content_ts @@ q ORDER BY rank DESC LIMIT 20) AS foo;`,
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

  /**
   * 检查地址是否在白名单中
   */
  async isWhiteListed(address: string, tokenId = 1): Promise<boolean> {
    const normalized = this.normalizeAddress(address);
    if (!normalized) return false;

    const entry = await this.prisma.whitelistEntry.findUnique({
      where: { address: normalized },
    });
    if (!entry || !entry.token_ids?.length) return false;
    if (this.allowedSources && !this.allowedSources.includes(entry.source)) {
      return false;
    }
    return entry.token_ids.includes(tokenId);
  }

  /**
   * 获取地址在白名单中的证明数据
   */
  async getProof(
    address: string,
    tokenId = 1,
  ): Promise<
    | false
    | {
        proof: string[];
        root: string;
      }
  > {
    const normalized = this.normalizeAddress(address);
    if (!normalized) return false;

    const isInList = await this.isWhiteListed(normalized, tokenId);
    if (!isInList) return false;

    const merkleInfo = await this.getMerkleTree(tokenId, true);
    if (!merkleInfo) return false;

    const leaf = keccak256(Buffer.from(normalized.slice(2), 'hex'));
    const proof = merkleInfo.tree
      .getProof(leaf)
      .map((p) => '0x' + p.data.toString('hex'));

    return { proof, root: merkleInfo.root };
  }

  async getMerkleRoot(tokenId = 1): Promise<string | null> {
    const merkleInfo = await this.getMerkleTree(tokenId);
    return merkleInfo ? merkleInfo.root : null;
  }

  private async getMerkleTree(
    tokenId = 1,
    forceRebuild = false,
  ): Promise<{
    tree: MerkleTree;
    root: string;
  } | null> {
    if (!forceRebuild) {
      const cached = this.merkleCache.get(tokenId);
      if (cached) return cached;
    }

    const entries = await this.prisma.whitelistEntry.findMany({
      where: {
        token_ids: {
          has: tokenId,
        },
        ...(this.allowedSources && this.allowedSources.length
          ? { source: { in: this.allowedSources } }
          : {}),
      },
      select: { address: true },
    });

    if (!entries || entries.length === 0) {
      return null;
    }

    const leaves = entries.map((entry) =>
      keccak256(Buffer.from(entry.address.replace(/^0x/, ''), 'hex')),
    );
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = '0x' + tree.getRoot().toString('hex');

    this.merkleCache.set(tokenId, { tree, root });

    await this.prisma.merkleRoot.upsert({
      where: { token_id: tokenId },
      update: { root },
      create: { token_id: tokenId, root },
    });

    return { tree, root };
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

      await this.prisma.eIPs.createMany({
        data: writeData,
      });
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
