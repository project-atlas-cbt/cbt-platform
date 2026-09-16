import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RESULT_ADJUSTMENT_TYPES, RESULT_STATES, type ResultAdjustmentType, type ResultState } from '@atlas/domain';

export class ListExamResultsQueryDto {
 @ApiPropertyOptional({type:String,description:'Student name or student ID substring.'}) @IsOptional() @IsString() q?:string;
 @ApiPropertyOptional({type:String,format:'uuid'}) @IsOptional() @IsUUID() classId?:string;
 @ApiPropertyOptional({enum:RESULT_STATES}) @IsOptional() @IsIn(RESULT_STATES) state?:ResultState;
 @ApiPropertyOptional({type:Number,default:1}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page?:number;
 @ApiPropertyOptional({type:Number,default:25,maximum:200}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(200) pageSize?:number;
 @ApiPropertyOptional({enum:['studentName','percentage','earnedMarks','finalizedAt']}) @IsOptional() @IsIn(['studentName','percentage','earnedMarks','finalizedAt']) sortBy?:'studentName'|'percentage'|'earnedMarks'|'finalizedAt';
 @ApiPropertyOptional({enum:['asc','desc']}) @IsOptional() @IsIn(['asc','desc']) sortDir?:'asc'|'desc';
}
export class ResultListItemDto {
 @ApiProperty() id!:string; @ApiProperty() attemptId!:string; @ApiProperty() studentProfileId!:string;
 @ApiProperty() studentName!:string; @ApiProperty() studentIdentifier!:string;
 @ApiProperty({nullable:true}) classId!:string|null; @ApiProperty({nullable:true}) className!:string|null;
 @ApiProperty({enum:RESULT_STATES}) state!:ResultState;
 @ApiProperty() totalMarks!:number; @ApiProperty() earnedMarks!:number; @ApiProperty() percentage!:number;
 @ApiProperty() correctCount!:number; @ApiProperty() incorrectCount!:number; @ApiProperty() unansweredCount!:number; @ApiProperty() partialCount!:number;
 @ApiProperty({nullable:true}) grade!:string|null; @ApiProperty() withheld!:boolean; @ApiProperty({nullable:true}) withheldReason!:string|null;
 @ApiProperty({nullable:true}) voidedReason!:string|null; @ApiProperty({nullable:true}) finalizedAt!:string|null; @ApiProperty({nullable:true}) submittedAt!:string|null; @ApiProperty() attemptState!:string;
}
export class ExamResultSummaryDto {
 @ApiProperty() studentCount!:number; @ApiProperty() absentCount!:number; @ApiProperty() resultCount!:number; @ApiProperty() voidedCount!:number; @ApiProperty() pendingCount!:number;
 @ApiProperty({nullable:true}) averagePercentage!:number|null; @ApiProperty({nullable:true}) highestPercentage!:number|null; @ApiProperty({nullable:true}) lowestPercentage!:number|null; @ApiProperty({nullable:true}) passRate!:number|null;
}
export class ExamResultClassSummaryDto extends ExamResultSummaryDto { @ApiProperty() classId!:string; @ApiProperty() className!:string; }
export class ExamResultsResponseDto {
 @ApiProperty({type:[ResultListItemDto]}) items!:ResultListItemDto[]; @ApiProperty() total!:number; @ApiProperty() page!:number; @ApiProperty() pageSize!:number;
 @ApiProperty({type:ExamResultSummaryDto}) summary!:ExamResultSummaryDto; @ApiProperty({type:[ExamResultClassSummaryDto]}) classSummaries!:ExamResultClassSummaryDto[]; @ApiProperty() published!:boolean; @ApiProperty() adjustmentInProgress!:boolean;
}
export class ResultQuestionBreakdownDto { @ApiProperty() examQuestionId!:string; @ApiProperty() displaySequence!:number; @ApiProperty() content!:string; @ApiProperty() correctness!:string; @ApiProperty() awardedMarks!:number; @ApiProperty() maximumMarks!:number; @ApiProperty() voided!:boolean; }
export class ResultAdjustmentHistoryItemDto { @ApiProperty() id!:string; @ApiProperty() operationId!:string; @ApiProperty({enum:RESULT_ADJUSTMENT_TYPES}) adjustmentType!:ResultAdjustmentType; @ApiProperty() reason!:string; @ApiProperty() authorizedByName!:string; @ApiProperty() createdAt!:string; @ApiProperty({type:Object}) oldValue!:Record<string,unknown>; @ApiProperty({type:Object}) newValue!:Record<string,unknown>; }
export class ResultDetailResponseDto extends ResultListItemDto { @ApiProperty() examId!:string; @ApiProperty() examTitle!:string; @ApiProperty() subjectName!:string; @ApiProperty({nullable:true}) gradingScaleVersionId!:string|null; @ApiProperty({type:[ResultQuestionBreakdownDto]}) questions!:ResultQuestionBreakdownDto[]; @ApiProperty({type:[ResultAdjustmentHistoryItemDto]}) adjustments!:ResultAdjustmentHistoryItemDto[]; }
export class ResultPublicationResponseDto { @ApiProperty() examId!:string; @ApiProperty({enum:['PUBLISHED','UNPUBLISHED']}) status!:'PUBLISHED'|'UNPUBLISHED'; @ApiProperty({nullable:true}) publishedAt!:string|null; @ApiProperty({nullable:true}) publishedByName!:string|null; @ApiProperty({nullable:true}) unpublishedAt!:string|null; @ApiProperty() adjustmentInProgress!:boolean; @ApiProperty() affectedResultCount!:number; }
export class PublishResultsDto { @ApiPropertyOptional() @IsOptional() @IsString() note?:string; }
export class UnpublishResultsDto { @ApiProperty() @IsString() @IsNotEmpty() reason!:string; }
export class WithholdResultDto { @ApiProperty() @IsString() @IsNotEmpty() reason!:string; }
export class CreateResultAdjustmentDto {
 @ApiProperty({format:'uuid'}) @IsUUID() examId!:string; @ApiProperty({enum:RESULT_ADJUSTMENT_TYPES}) @IsIn(RESULT_ADJUSTMENT_TYPES) type!:ResultAdjustmentType; @ApiProperty() @IsString() @IsNotEmpty() reason!:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() targetExamQuestionId?:string; @ApiPropertyOptional() @IsOptional() @Type(()=>Number) @IsInt() @Min(1) markDelta?:number;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() targetResultId?:string; @ApiPropertyOptional() @IsOptional() @Type(()=>Number) @IsInt() @Min(0) overrideEarnedMarks?:number;
}
export class ResultAdjustmentOperationResponseDto { @ApiProperty() id!:string; @ApiProperty() examId!:string; @ApiProperty({enum:RESULT_ADJUSTMENT_TYPES}) type!:ResultAdjustmentType; @ApiProperty({enum:['PENDING','PROCESSING','COMPLETED','FAILED']}) status!:'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; @ApiProperty() reason!:string; @ApiProperty() totalCount!:number; @ApiProperty() appliedCount!:number; @ApiProperty() failedCount!:number; @ApiProperty({nullable:true}) failureReason!:string|null; @ApiProperty() createdByName!:string; @ApiProperty() createdAt!:string; @ApiProperty({nullable:true}) completedAt!:string|null; }
