import { IsNumber, IsString } from 'class-validator';
import { EIPStatus } from '@prisma/client';

export class EIPBaseDto {
  @IsNumber()
  eip: string;

  @IsString()
  status: EIPStatus;

  @IsString()
  title: string;

  @IsString()
  author: string;
}
