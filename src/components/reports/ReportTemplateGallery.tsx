import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { getReportTemplates, ReportTemplate } from '../../lib/reportTemplates';
import { ReportTemplateCard } from './ReportTemplateCard';

interface ReportTemplateGalleryProps {
  /// When `mode === 'modal'`, the gallery renders inside a Modal with
  /// its own title bar. When `mode === 'inline'`, it renders a plain
  /// section suitable for the empty-state of ReportsList.
  mode: 'modal' | 'inline';
  /// Modal-only: whether the modal is open. Ignored when inline.
  isOpen?: boolean;
  onClose?: () => void;
  /// Receives the picked template (or `null` for "Start blank"). The
  /// caller handles opening the editor with the right initial body.
  onPick: (template: ReportTemplate | null) => void;
}

/// Grid of curated template cards plus a "Start blank" card. The grid
/// is 2-up on `sm` and wider, single-column on narrow viewports.
const TemplateGrid = memo(function TemplateGrid({
  templates,
  onPick,
}: { templates: ReportTemplate[]; onPick: (template: ReportTemplate | null) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {templates.map((t) => (
        <ReportTemplateCard
          key={t.id}
          template={t}
          onClick={() => onPick(t)}
        />
      ))}
      <ReportTemplateCard onClick={() => onPick(null)} />
    </div>
  );
});

export const ReportTemplateGallery = memo(function ReportTemplateGallery({
  mode, isOpen, onClose, onPick,
}: ReportTemplateGalleryProps) {
  const { t } = useTranslation();
  const templates = getReportTemplates(t);

  if (mode === 'modal') {
    return (
      <Modal
        isOpen={isOpen ?? false}
        onClose={onClose ?? (() => undefined)}
        title={t('reports_editor_new_title')}
        width="lg"
        showFooter={false}
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-4 leading-relaxed">
          {t('reports_template_gallery_description')}
        </p>
        <TemplateGrid templates={templates} onPick={onPick} />
      </Modal>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-5">
        <h2 className="text-base font-medium text-[var(--color-text-primary)] mb-1">
          {t('reports_template_inline_title')}
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('reports_template_inline_description')}
        </p>
      </header>
      <TemplateGrid templates={templates} onPick={onPick} />
    </section>
  );
});
