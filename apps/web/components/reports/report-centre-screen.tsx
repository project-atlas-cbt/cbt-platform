'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@atlas/domain';
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  Building,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportDialog } from './export/export-dialog';
import { type ExportType, type ExportJob } from '@/lib/reports/types';

export interface ReportCentreScreenProps {
  role: Role;
  basePath: string;
}

interface ExportTypeConfig {
  type: ExportType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const EXPORT_CONFIGS: ExportTypeConfig[] = [
  {
    type: 'EXAM_RESULTS',
    title: 'Exam Results & Marks',
    description:
      'Complete score sheets including candidate names, marks, grades, and statuses (ABSENT and AUTO-SUBMITTED preserved truthfully).',
    icon: FileSpreadsheet,
  },
  {
    type: 'PARTICIPATION',
    title: 'Exam Participation & Attendance',
    description:
      'Candidate attendance log per exam session, tracking present candidates, recorded absences, and makeup eligibility.',
    icon: ClipboardList,
  },
  {
    type: 'STUDENTS',
    title: 'Student Directory',
    description:
      'Enrolled students list with admission numbers, names, current active class arms, and contact details.',
    icon: GraduationCap,
  },
  {
    type: 'CLASSES',
    title: 'Class Groups & Levels',
    description:
      'Structured record of all classes, arms, and assigned departments across the academic session.',
    icon: Building,
  },
  {
    type: 'QUESTION_BANK',
    title: 'Question Bank',
    description:
      'Re-importable CSV of question items, options, difficulty ratings, topics, and marks for backup and curriculum review.',
    icon: BookOpen,
  },
  {
    type: 'TEACHERS',
    title: 'Teaching Staff Directory',
    description: 'List of active teachers, staff IDs, and assigned class-subject offerings.',
    icon: Users,
  },
];

export function ReportCentreScreen({ role, basePath }: ReportCentreScreenProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ExportType>('EXAM_RESULTS');
  const [recentJobs, setRecentJobs] = useState<ExportJob[]>([]);

  // Print helper inputs
  const [printExamId, setPrintExamId] = useState('');
  const [printClassId, setPrintClassId] = useState('');
  const [printStudentId, setPrintStudentId] = useState('');

  // Filter datasets available for current role
  const availableExports = EXPORT_CONFIGS.filter((cfg) => {
    if (role === 'TEACHER') {
      return cfg.type !== 'TEACHERS';
    }
    return true;
  });

  function handleOpenExport(type: ExportType) {
    setSelectedType(type);
    setDialogOpen(true);
  }

  function handleExportSuccess(job: ExportJob) {
    setRecentJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
  }

  return (
    <div className="space-y-8" data-testid="report-centre-screen">
      {/* Screen Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Reporting &amp; Export Centre
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Generate official CSV exports and access printable broadsheets, performance analytics, and
          transcripts.
        </p>
      </div>

      {/* CSV Exports Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="size-5 text-brand-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Academic Data Exports (CSV)</h2>
        </div>
        <p className="text-xs text-text-muted">
          All CSV exports are generated asynchronously from your authorized academic scope. Download
          capabilities expire after 15 minutes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableExports.map((cfg) => {
            const Icon = cfg.icon;
            return (
              <div
                key={cfg.type}
                className="flex flex-col justify-between rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-md bg-brand-primary-subtle text-brand-primary">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-text-primary">{cfg.title}</h3>
                  </div>
                  <p className="text-xs text-text-muted mt-2 line-clamp-3">{cfg.description}</p>
                </div>
                <div className="pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-between gap-1 text-xs"
                    onClick={() => handleOpenExport(cfg.type)}
                  >
                    <span>Request Export</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent / Active Exports in this session */}
      {recentJobs.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border bg-surface-muted/20 p-4">
          <h3 className="text-sm font-semibold text-text-primary">Recent Export Requests</h3>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3 text-xs"
              >
                <div>
                  <span className="font-semibold">{job.type.replace('_', ' ')}</span>
                  <span className="ml-2 font-mono text-text-muted">
                    Job ID: {job.id.slice(0, 8)}...
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => router.push(`${basePath}/reports/exports/${job.id}`)}
                >
                  View Status
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Printable Reports Section (ADR-0030) */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Printer className="size-5 text-brand-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Printable Official Reports</h2>
        </div>
        <p className="text-xs text-text-muted">
          Print-optimized layouts designed for official paper records, parent reports, and browser
          PDF generation.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Exam Results & Broadsheet */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <FileText className="size-4 text-brand-primary" />
                Examination Results Broadsheet
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Official tabulation of marks, percentages, grades, and attendance for an
                examination.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="print-exam-input" className="text-xs">
                  Exam ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="print-exam-input"
                    value={printExamId}
                    onChange={(e) => setPrintExamId(e.target.value)}
                    placeholder="Enter Exam UUID"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!printExamId.trim()}
                    onClick={() => router.push(`/print/exams/${printExamId.trim()}/results`)}
                  >
                    <ExternalLink className="size-3.5 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Item Diagnostics */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <BookOpen className="size-4 text-brand-primary" />
                Exam Performance &amp; Item Diagnostics
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Item-by-item question analysis, success rates, difficulty indicators, and
                discrimination stats.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="print-perf-exam-input" className="text-xs">
                  Exam ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="print-perf-exam-input"
                    value={printExamId}
                    onChange={(e) => setPrintExamId(e.target.value)}
                    placeholder="Enter Exam UUID"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!printExamId.trim()}
                    onClick={() => router.push(`/print/exams/${printExamId.trim()}/performance`)}
                  >
                    <ExternalLink className="size-3.5 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Class Academic Summary */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Building className="size-4 text-brand-primary" />
                Class Academic Performance Sheet
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Class group performance breakdown across subjects, enrolled counts, and term
                standings.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="print-class-input" className="text-xs">
                  Class ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="print-class-input"
                    value={printClassId}
                    onChange={(e) => setPrintClassId(e.target.value)}
                    placeholder="Enter Class UUID"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!printClassId.trim()}
                    onClick={() => router.push(`/print/classes/${printClassId.trim()}/performance`)}
                  >
                    <ExternalLink className="size-3.5 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Student Academic Transcript */}
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <GraduationCap className="size-4 text-brand-primary" />
                Student Academic Performance Transcript
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Individual student report card with all assessment scores, class averages, and GPA
                metrics.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="print-student-input" className="text-xs">
                  Student ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="print-student-input"
                    value={printStudentId}
                    onChange={(e) => setPrintStudentId(e.target.value)}
                    placeholder="Enter Student UUID"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!printStudentId.trim()}
                    onClick={() =>
                      router.push(`/print/students/${printStudentId.trim()}/performance`)
                    }
                  >
                    <ExternalLink className="size-3.5 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Export Dialog */}
      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        role={role}
        initialType={selectedType}
        onSuccess={handleExportSuccess}
      />
    </div>
  );
}
