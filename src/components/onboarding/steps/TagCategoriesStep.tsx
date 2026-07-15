import { useTranslation } from 'react-i18next';
import type { OnboardingState, OnboardingAction } from '../useOnboardingState';
import { DEFAULT_TAG_CATEGORIES } from '../useOnboardingState';

interface TagCategoriesStepProps {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}

export function TagCategoriesStep({ state, dispatch }: TagCategoriesStepProps) {
  const { t } = useTranslation();

  // If auto-tagging is disabled, this step is a no-op informational screen.
  if (!state.autoTaggingEnabled) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('onboarding_tag_categories_title')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {t('onboarding_tag_categories_auto_off')}
          </p>
        </div>
      </div>
    );
  }

  const isSelected = (name: string) => state.selectedDefaultCategories.includes(name);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('onboarding_tag_categories_choose')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {t('onboarding_tag_categories_choose_description')}
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('onboarding_tag_categories_default')}
        </div>
        <div className="space-y-1">
          {DEFAULT_TAG_CATEGORIES.map(name => (
            <label
              key={name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] cursor-pointer hover:bg-[var(--color-bg-hover)]"
            >
              <input
                type="checkbox"
                checked={isSelected(name)}
                onChange={() => dispatch({ type: 'TOGGLE_DEFAULT_CATEGORY', name })}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-primary)]">{name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {t('onboarding_tag_categories_custom')}
        </div>
        {state.customCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.customCategories.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-accent)]/15 text-xs text-[var(--color-text-primary)] border border-[var(--color-accent)]/40"
              >
                {name}
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'REMOVE_CUSTOM_CATEGORY', name })}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={state.customCategoryInput}
            onChange={e => dispatch({ type: 'SET_CUSTOM_CATEGORY_INPUT', value: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                dispatch({ type: 'ADD_CUSTOM_CATEGORY' });
              }
            }}
            placeholder={t('onboarding_tag_categories_add_placeholder')}
            className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_CUSTOM_CATEGORY' })}
            disabled={!state.customCategoryInput.trim()}
            className="px-3 py-1.5 text-sm rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('onboarding_tag_categories_add')}
          </button>
        </div>
      </div>

      {state.categoriesError && (
        <div className="text-xs text-red-400">{state.categoriesError}</div>
      )}

      {state.selectedDefaultCategories.length === 0 && state.customCategories.length === 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          {t('onboarding_tag_categories_no_categories_warning')}
        </div>
      )}
    </div>
  );
}
