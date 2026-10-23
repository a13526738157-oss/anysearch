import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = '', ...props }: Props) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
    {children}
  </button>;
}
