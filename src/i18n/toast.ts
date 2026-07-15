import { toast } from 'sonner';
import i18next from 'i18next';

export interface Toasti18nOptions {
  description?: string;
  id?: string;
  /** i18n interpolation values passed to t(key, values) */
  values?: Record<string, string | number | boolean | undefined>;
}

export const toasti18n = {
  error(key: string, opts?: Toasti18nOptions) {
    const message = i18next.t(key, opts?.values);
    const description = opts?.description ? i18next.t(opts.description) : undefined;
    toast.error(message, { description, id: opts?.id });
  },

  success(key: string, opts?: Toasti18nOptions) {
    const message = i18next.t(key, opts?.values);
    const description = opts?.description ? i18next.t(opts.description) : undefined;
    toast.success(message, { description, id: opts?.id });
  },

  info(key: string, opts?: Toasti18nOptions) {
    const message = i18next.t(key, opts?.values);
    const description = opts?.description ? i18next.t(opts.description) : undefined;
    toast.info(message, { description, id: opts?.id });
  },

  warning(key: string, opts?: Toasti18nOptions) {
    const message = i18next.t(key, opts?.values);
    const description = opts?.description ? i18next.t(opts.description) : undefined;
    toast.warning(message, { description, id: opts?.id });
  },
};