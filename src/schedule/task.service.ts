import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval, Timeout } from '@nestjs/schedule';
import { AppService } from 'src/app.service';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);
   
    // constructor(private readonly appService: AppService) { }

    @Cron('10 * * * * *')
     handleCron() {
        console.log(1111)
        this.logger.debug('该方法将在30秒标记处每分钟运行一次');

    }

    @Interval(6000)
     handleInterval() {
        this.logger.debug('该方法将在1秒标记处每分钟运行一次');
    }

}