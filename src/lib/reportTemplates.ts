import { LucideIcon, Sunrise, Scale, HelpCircle, Compass } from 'lucide-react';
import { CreateReportInput } from '../stores/reports';

export interface ReportTemplate {
  id: string;
  description: string;
  scheduleHint: string;
  icon: LucideIcon;
  body: CreateReportInput;
}

type TranslateFunction = (key: string) => string;

function makeDailyBriefing(t: TranslateFunction): ReportTemplate {
  return {
    id: 'daily-briefing',
    description: t('reports_template_daily_briefing_description'),
    scheduleHint: t('reports_template_daily_briefing_schedule_hint'),
    icon: Sunrise,
    body: {
      name: t('reports_template_daily_briefing_name'),
      description: t('reports_template_daily_briefing_description'),
      research_prompt: t('reports_template_daily_briefing_prompt'),
      schedule: '0 0 9 * * *',
      schedule_tz: null,
      enabled: true,
      source_scope_tag_ids: [],
      source_scope_window: 'since_last_run',
      source_include_kinds: ['captured'],
      context_scope_mode: 'same_as_source',
      context_scope_tag_ids: [],
      context_scope_window: null,
      context_include_kinds: ['captured'],
      citation_policy: 'source_only',
      output_atom_tags: [],
    },
  };
}

function makeWeeklyContradictions(t: TranslateFunction): ReportTemplate {
  return {
    id: 'weekly-contradictions',
    description: t('reports_template_weekly_contradictions_description'),
    scheduleHint: t('reports_template_weekly_contradictions_schedule_hint'),
    icon: Scale,
    body: {
      name: t('reports_template_weekly_contradictions_name'),
      description: t('reports_template_weekly_contradictions_description'),
      research_prompt: t('reports_template_weekly_contradictions_prompt'),
      schedule: '0 0 9 * * 1',
      schedule_tz: null,
      enabled: true,
      source_scope_tag_ids: [],
      source_scope_window: 'since_last_run',
      source_include_kinds: ['captured'],
      context_scope_mode: 'all',
      context_scope_tag_ids: [],
      context_scope_window: 'older_than_source',
      context_include_kinds: ['captured'],
      citation_policy: 'source_and_context',
      output_atom_tags: [],
    },
  };
}

function makeOpenQuestions(t: TranslateFunction): ReportTemplate {
  return {
    id: 'open-questions',
    description: t('reports_template_open_questions_description'),
    scheduleHint: t('reports_template_open_questions_schedule_hint'),
    icon: HelpCircle,
    body: {
      name: t('reports_template_open_questions_name'),
      description: t('reports_template_open_questions_description'),
      research_prompt: t('reports_template_open_questions_prompt'),
      schedule: '0 0 16 * * 5',
      schedule_tz: null,
      enabled: true,
      source_scope_tag_ids: [],
      source_scope_window: 'since_last_run',
      source_include_kinds: ['captured'],
      context_scope_mode: 'same_as_source',
      context_scope_tag_ids: [],
      context_scope_window: null,
      context_include_kinds: ['captured'],
      citation_policy: 'source_and_context',
      output_atom_tags: [],
    },
  };
}

function makeMonthlyThemes(t: TranslateFunction): ReportTemplate {
  return {
    id: 'monthly-themes',
    description: t('reports_template_monthly_themes_description'),
    scheduleHint: t('reports_template_monthly_themes_schedule_hint'),
    icon: Compass,
    body: {
      name: t('reports_template_monthly_themes_name'),
      description: t('reports_template_monthly_themes_description'),
      research_prompt: t('reports_template_monthly_themes_prompt'),
      schedule: '0 0 10 1 * *',
      schedule_tz: null,
      enabled: true,
      source_scope_tag_ids: [],
      source_scope_window: { duration: 'P30D' },
      source_include_kinds: ['captured'],
      context_scope_mode: 'same_as_source',
      context_scope_tag_ids: [],
      context_scope_window: null,
      context_include_kinds: ['captured'],
      citation_policy: 'source_only',
      output_atom_tags: [],
    },
  };
}

export function getReportTemplates(t: TranslateFunction): ReportTemplate[] {
  return [
    makeDailyBriefing(t),
    makeWeeklyContradictions(t),
    makeOpenQuestions(t),
    makeMonthlyThemes(t),
  ];
}
