import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--color-bg-main)] disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px';
    
    const variants = {
      primary: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] hover:shadow-md focus:ring-[var(--color-accent)]',
      secondary: 'bg-[var(--color-bg-card)]/80 backdrop-blur-sm text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-card)] hover:shadow-sm focus:ring-[var(--color-border)]',
      ghost: 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus:ring-[var(--color-border)]',
      danger: 'bg-red-600 text-white hover:bg-red-700 hover:shadow-md focus:ring-red-500',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

