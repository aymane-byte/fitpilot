import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold active:brightness-90',
  secondary: 'bg-surface-2 text-fg font-medium border border-line active:bg-line',
  ghost: 'text-accent-text font-medium active:bg-accent-soft',
  danger: 'bg-danger/12 text-danger font-semibold border border-danger/30 active:bg-danger/20',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'min-h-11 px-4 text-[15px] rounded-2xl gap-2',
  lg: 'min-h-13 px-5 text-base rounded-2xl gap-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, icon, className = '', children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center select-none transition disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
