import i18n from 'i18next';

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return i18n.t('time_just_now');
  } else if (diffMins < 60) {
    return i18n.t('time_minutes_ago', { count: diffMins });
  } else if (diffHours < 24) {
    return i18n.t('time_hours_ago', { count: diffHours });
  } else if (diffDays === 1) {
    return i18n.t('time_yesterday');
  } else if (diffDays < 7) {
    return i18n.t('time_days_ago', { count: diffDays });
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return i18n.t('time_weeks_ago', { count: weeks });
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return i18n.t('time_months_ago', { count: months });
  } else {
    const years = Math.floor(diffDays / 365);
    return i18n.t('time_years_ago', { count: years });
  }
}

export function formatShortRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const monthDay = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return `${monthDay} ${timeStr}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return formatDate(dateString);
  }
}

