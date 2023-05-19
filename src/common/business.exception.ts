// this exception used for Business logic error, like not found the item, etc

import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(response) {
    super(response, HttpStatus.OK);
  }
}
