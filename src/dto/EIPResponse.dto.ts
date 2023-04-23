import { EIPBaseDto } from './EIPBase.dto';
import { IsDate, IsString } from 'class-validator';
import { EIPStatus } from '@prisma/client';

export class EIPResponseDto extends EIPBaseDto {
  @IsString()
  description?: string;

  @IsString()
  type: string;
  
  @IsString()
  discussions_to?: string;

  @IsDate()
  created: Date;

  @IsString()
  content?: string;

  @IsString()
  requires?: number[];

  @IsString()
  withdrawal_reason?: string;

  @IsDate()
  last_call_deadline?: Date;
}
