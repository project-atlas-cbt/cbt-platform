'use client';

import { formatResultPercentage } from '@/lib/results/format';

export interface ExamResultSummary {
  studentCount: number;
  absentCount: number;
  resultCount: number;
  voidedCount: number;
  pendingCount: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  passRate: number | null;
}
export interface ExamResultClassSummary extends ExamResultSummary { classId:string; className:string; }
function formatOptionalPercentage(value:number|null):string{return value===null?'—':formatResultPercentage(value);}

/** B16 supplies authoritative roster and absence totals; averages exclude voided results. */
export function ExamResultSummaryPanel({summary}:{summary:ExamResultSummary}){
 const items=[
  {label:'Students',value:String(summary.studentCount)},
  {label:'Absent',value:String(summary.absentCount)},
  {label:'Results',value:String(summary.resultCount)},
  {label:'Average',value:formatOptionalPercentage(summary.averagePercentage)},
  {label:'Highest',value:formatOptionalPercentage(summary.highestPercentage)},
  {label:'Lowest',value:formatOptionalPercentage(summary.lowestPercentage)},
  {label:'Pass rate',value:formatOptionalPercentage(summary.passRate)},
  {label:'Pending',value:String(summary.pendingCount)},
  {label:'Voided',value:String(summary.voidedCount)},
 ];
 return <div className="rounded-lg border border-border bg-surface p-4">
  <dl className="flex flex-wrap gap-x-8 gap-y-3">{items.map(item=><div key={item.label}><dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{item.label}</dt><dd className="mt-0.5 text-sm font-semibold text-text-primary">{item.value}</dd></div>)}</dl>
  <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">Student and absence totals come from recorded participation. Averages exclude voided results.</p>
 </div>;
}

export function ExamResultClassTabs({classSummaries,activeClassId,onChange}:{classSummaries:ExamResultClassSummary[];activeClassId:string;onChange:(classId:string)=>void}){
 if(classSummaries.length<2)return null;
 const tabs=[{id:'',label:'All classes'}].concat(classSummaries.map(item=>({id:item.classId,label:item.className})));
 return <div role="tablist" aria-label="Filter results by class" className="flex flex-wrap gap-1">{tabs.map(tab=>{const active=tab.id===activeClassId;return <button key={tab.id||'all'} type="button" role="tab" aria-selected={active} onClick={()=>onChange(tab.id)} className={active?'rounded-md border border-brand-primary bg-brand-primary/10 px-3 py-1.5 text-sm font-medium text-text-primary':'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary'}>{tab.label}</button>;})}</div>;
}
