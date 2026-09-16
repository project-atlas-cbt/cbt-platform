import { Worker, type ConnectionOptions } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import { computeAttemptQuestionMarkingResults, ATTEMPT_MARKING_QUEUE_NAME, type AttemptMarkingJobPayload, type AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { autoPublishIfPolicyRequires, finalizeResultAfterMarking, recordAutoPublication, type FinalizedResultOutcome } from './result-finalization.js';

export interface AttemptMarkingWorkerDeps { onBeforeUpsert?: (index:number)=>void; }
export async function runAttemptMarking(deps:AttemptMarkingWorkerDeps,payload:AttemptMarkingJobPayload):Promise<void>{
 const {schoolId,attemptId}=payload;let finalized:FinalizedResultOutcome|undefined;let published=false;
 await withTenant(prisma,schoolId,async tx=>{
  const locked=await tx.$queryRaw<{state:string}[]>`SELECT state::text AS state FROM exam_attempts WHERE school_id=${schoolId}::uuid AND id=${attemptId}::uuid FOR UPDATE`;
  const state=locked[0]?.state;if(!state)throw new Error(`attempt ${attemptId} was not found`);if(state==='INVALIDATED'||state==='CANCELLED')return;if(state!=='SUBMITTED'&&state!=='AUTO_SUBMITTED')throw new Error(`attempt ${attemptId} is ${state} — refusing to mark before submission`);
  const snapshot=await tx.attemptQuestionSnapshot.findUniqueOrThrow({where:{schoolId_attemptId:{schoolId,attemptId}}});
  const answers=await tx.attemptAnswer.findMany({where:{schoolId,attemptId},select:{examQuestionId:true,selectedOptionId:true}});const answersByExamQuestionId=new Map(answers.map(answer=>[answer.examQuestionId,{selectedOptionId:answer.selectedOptionId}]));const document=snapshot.document as unknown as AttemptSnapshotDocumentV1;const results=computeAttemptQuestionMarkingResults(document,answersByExamQuestionId);
  for(const [index,result]of results.entries()){deps.onBeforeUpsert?.(index);await tx.attemptQuestionResult.upsert({where:{schoolId_attemptId_examQuestionId:{schoolId,attemptId,examQuestionId:result.examQuestionId}},create:{schoolId,attemptId,...result},update:{correctness:result.correctness,awardedMarks:result.awardedMarks,maximumMarks:result.maximumMarks}});}
  finalized=await finalizeResultAfterMarking(tx,schoolId,attemptId,results);if(finalized.autoPublish)published=await autoPublishIfPolicyRequires(tx,schoolId,finalized.examId);
 });
 if(finalized&&published){const outcome=finalized;try{const exam=await withTenant(prisma,schoolId,tx=>tx.exam.findUniqueOrThrow({where:{id:outcome.examId},select:{title:true}}));await recordAutoPublication(schoolId,outcome,exam.title,outcome.studentUserId);}catch(error){console.error(`[attempt-marking] result ${finalized.resultId} was published automatically but its audit/notification write failed: ${String(error)}`);}}
}
export function createAttemptMarkingWorker(connection:ConnectionOptions,deps:AttemptMarkingWorkerDeps):Worker<AttemptMarkingJobPayload>{return new Worker<AttemptMarkingJobPayload>(ATTEMPT_MARKING_QUEUE_NAME,async job=>runAttemptMarking(deps,job.data),{connection});}
