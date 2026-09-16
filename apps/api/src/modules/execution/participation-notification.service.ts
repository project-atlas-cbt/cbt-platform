import { Injectable } from '@nestjs/common';
import { prisma,withTenant } from '@atlas/db';
import { NotificationService } from '../notification-center/notification.service.js';
import type { AuthorizationType } from './dto/participation.dto.js';

@Injectable()
export class ParticipationNotificationService{
 constructor(private readonly notifications:NotificationService){}
 async authorizationGranted(schoolId:string,studentProfileId:string,examId:string,type:AuthorizationType):Promise<void>{
  const profile=await withTenant(prisma,schoolId,tx=>tx.studentProfile.findUnique({where:{id:studentProfileId},select:{membership:{select:{userId:true}}}}));
  if(!profile)return;
  await this.notifications.record({schoolId,recipientUserId:profile.membership.userId,type:'MAKEUP_GRANTED',title:type==='MAKEUP'?'Makeup authorized':'Retry authorized',content:type==='MAKEUP'?'You have been granted a makeup attempt.':'You have been granted a retry attempt.',relatedEntityType:'Exam',relatedEntityId:examId});
 }
}
