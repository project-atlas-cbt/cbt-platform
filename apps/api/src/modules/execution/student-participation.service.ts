import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { classifyAttemptParticipation, type AttemptAuthorizationStatus, type AttemptAuthorizationType, type AttemptParticipationClassification, type ParticipationStatus } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';

type SittingRow={examId:string;examTitle:string;subjectName:string;examSessionId:string;sessionType:string;sessionStatus:string;openedAt:Date;participationStatus:ParticipationStatus;attemptId:string|null;attemptState:'NOT_STARTED'|'IN_PROGRESS'|'SUBMITTED'|'AUTO_SUBMITTED'|'INVALIDATED'|'CANCELLED'|null;invalidationReason:string|null;markedAt:Date|null};
type AuthRow={id:string;examId:string;studentProfileId:string;type:AttemptAuthorizationType;status:AttemptAuthorizationStatus;reason:string;authorizedAt:Date;expiresAt:Date|null;sourceExamSessionId:string|null;sourceParticipationId:string|null;sourceAttemptId:string|null;usedByAttemptId:string|null;usedAt:Date|null;revokedAt:Date|null;revokedReason:string|null};
const priority:Record<AttemptParticipationClassification,number>={COMPLETED:6,IN_PROGRESS:5,INCOMPLETE:4,ABSENT:3,INVALIDATED:2,PENDING:1};
const mapAuth=(row:AuthRow)=>{const status=row.status==='AUTHORIZED'&&row.expiresAt&&row.expiresAt<=new Date()?'EXPIRED':row.status;return {...row,status,authorizedAt:row.authorizedAt.toISOString(),expiresAt:row.expiresAt?.toISOString()??null,usedAt:row.usedAt?.toISOString()??null,revokedAt:row.revokedAt?.toISOString()??null,revocable:status==='AUTHORIZED'};};

@Injectable()
export class StudentParticipationService{
 constructor(private readonly authz:AuthorizationService){}
 async list(schoolId:string,actor:AuthorizedActor){
  if(actor.kind!=='SCHOOL'||!actor.roles.includes('STUDENT'))throw new AppHttpException({code:'FORBIDDEN',message:'Only a student may view participation history.'});
  const decision=await this.authz.evaluate(actor,'analytics.studentHistory',{schoolId,ownerUserId:actor.userId});
  if(!decision.allowed)throw new AppHttpException({code:'FORBIDDEN',message:'Only a student may view participation history.'});
  const profile=await withTenant(prisma,schoolId,tx=>tx.studentProfile.findUnique({where:{schoolId_membershipId:{schoolId,membershipId:actor.membershipId}},select:{id:true}}));
  if(!profile)throw new AppHttpException({code:'FORBIDDEN',message:'Only a student may view participation history.'});
  const [sittings,authorizationRows]=await withTenant(prisma,schoolId,tx=>Promise.all([
   tx.$queryRaw<SittingRow[]>`SELECT e.id "examId",e.title "examTitle",subject.name "subjectName",s.id "examSessionId",s.session_type::text "sessionType",s.status::text "sessionStatus",s.opened_at "openedAt",COALESCE(p.status::text,'PENDING') "participationStatus",a.id "attemptId",a.state::text "attemptState",a.invalidation_reason "invalidationReason",p.marked_at "markedAt" FROM exam_session_participants participant JOIN exam_sessions s ON s.school_id=participant.school_id AND s.id=participant.exam_session_id JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id JOIN subjects subject ON subject.school_id=e.school_id AND subject.id=e.subject_id LEFT JOIN exam_participations p ON p.school_id=participant.school_id AND p.exam_session_id=s.id AND p.student_profile_id=participant.student_profile_id LEFT JOIN LATERAL(SELECT x.id,x.state,x.invalidation_reason FROM exam_attempts x WHERE x.school_id=participant.school_id AND x.exam_session_id=s.id AND x.student_profile_id=participant.student_profile_id ORDER BY x.attempt_number DESC LIMIT 1)a ON true WHERE participant.school_id=${schoolId}::uuid AND participant.student_profile_id=${profile.id}::uuid AND participant.status='AUTHORIZED' ORDER BY s.opened_at DESC`,
   tx.$queryRaw<AuthRow[]>`SELECT id,exam_id "examId",student_profile_id "studentProfileId",type,status,reason,authorized_at "authorizedAt",expires_at "expiresAt",source_exam_session_id "sourceExamSessionId",source_participation_id "sourceParticipationId",source_attempt_id "sourceAttemptId",used_by_attempt_id "usedByAttemptId",used_at "usedAt",revoked_at "revokedAt",revoked_reason "revokedReason" FROM attempt_authorizations WHERE school_id=${schoolId}::uuid AND student_profile_id=${profile.id}::uuid ORDER BY authorized_at DESC`
  ]));
  const auths=authorizationRows.map(mapAuth);const grouped=new Map<string,SittingRow[]>();for(const row of sittings)grouped.set(row.examId,[...(grouped.get(row.examId)??[]),row]);
  return {items:[...grouped.values()].map(group=>{const mapped=group.map(row=>{const classification=classifyAttemptParticipation(row);return {examSessionId:row.examSessionId,sessionLabel:`${row.sessionType} · ${row.openedAt.toISOString()}`,sessionType:row.sessionType,sessionStatus:row.sessionStatus,participationStatus:row.participationStatus,classification,attemptState:row.attemptState,invalidationReason:row.invalidationReason,markedAt:row.markedAt?.toISOString()??null,sourceAuthorizations:auths.filter(a=>a.examId===row.examId&&(a.sourceExamSessionId===row.examSessionId||a.usedByAttemptId===row.attemptId))};});const best=[...mapped].sort((a,b)=>priority[b.classification]-priority[a.classification])[0]!;return {examId:group[0]!.examId,examTitle:group[0]!.examTitle,subjectName:group[0]!.subjectName,classification:best.classification,sittings:mapped,authorizations:auths.filter(a=>a.examId===group[0]!.examId)};})};
 }
}
