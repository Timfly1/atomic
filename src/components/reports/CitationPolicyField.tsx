import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CitationPolicy } from '../../stores/reports';

interface CitationPolicyFieldProps {
  value: CitationPolicy;
  onChange: (next: CitationPolicy) => void;
}

const OPTIONS: { value: CitationPolicy; labelKey: string; helperKey: string }[] = [
  {
    value: 'source_only',
    labelKey: 'reports_editor_citation_source_only_label',
    helperKey: 'reports_editor_citation_source_only_helper',
  },
  {
    value: 'source_and_context',
    labelKey: 'reports_editor_citation_source_and_context_label',
    helperKey: 'reports_editor_citation_source_and_context_helper',
  },
];

/// Two-option radio for the report's citation policy. The default
/// (source-only) is the conservative answer for most reports — the agent
/// can only point at the atoms that triggered this run. Switching to
/// context-citable opens the citation pool to whatever shows up in
/// semantic_search results, which is the right answer for
/// contradiction-detection or open-question reports where the *point*
/// is to compare new evidence against the prior corpus.
export const CitationPolicyField = memo(function CitationPolicyField({
  value, onChange,
}: CitationPolicyFieldProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-text-tertiary)] mb-1">
        {t('reports_editor_citation_policy_label')}
      </legend>
      {OPTIONS.map(opt => {
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            className={`
              flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
              border
              ${checked
                ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5'
                : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
              }
            `}
          >
            <input
              type="radio"
              name="citation-policy"
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <div className="flex flex-col">
              <span className="text-sm text-[var(--color-text-primary)]">{t(opt.labelKey)}</span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">{t(opt.helperKey)}</span>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
});