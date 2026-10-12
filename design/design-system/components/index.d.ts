import type * as React from 'react';

export type IconName = 'home' | 'receipt' | 'calendar' | 'user' | 'more' | 'plus' | 'check' | 'chevron-right' | 'search' | 'wallet' | 'alert';

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; title?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface AppBarProps { name?: string; branch?: string; right?: React.ReactNode; className?: string }
export declare function AppBar(props: AppBarProps): React.ReactElement;

export interface NavItem { key: string; label: string; icon: IconName; badge?: number }
export interface BottomNavProps { items?: NavItem[]; active: string; onChange?: (key: string) => void; ariaLabel?: string; className?: string }
export declare function BottomNav(props: BottomNavProps): React.ReactElement;

export interface FabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { label?: string; icon?: IconName; placement?: 'fixed' | 'inline' }
export declare function Fab(props: FabProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  block?: boolean;
  loading?: boolean;
  loadingText?: string;
  icon?: IconName;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface SegmentOption { value: string; label: string }
export interface SegmentedControlProps { options: Array<string | SegmentOption>; value: string; onChange?: (value: string) => void; ariaLabel?: string; className?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface MoneyProps { value: number; size?: 'xl' | 'md' | 'sm'; tone?: 'muted' | 'negative' | 'positive'; sign?: boolean; className?: string }
export declare function Money(props: MoneyProps): React.ReactElement;

export interface SummaryRow { label: string; value: number; tone?: MoneyProps['tone'] }
export interface SummaryCardProps { label: string; value: number; rows?: SummaryRow[]; footnote?: string; className?: string }
export declare function SummaryCard(props: SummaryCardProps): React.ReactElement;

export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'refund_partial' | 'refund_full';
export type OrderStatus = 'draft' | 'in_progress' | 'awaiting' | 'confirmed' | 'cancelled';
export interface StatusChipProps { status: PaymentStatus | OrderStatus; tone?: 'success' | 'warning' | 'danger' | 'accent' | 'neutral'; children?: React.ReactNode; className?: string }
export declare function StatusChip(props: StatusChipProps): React.ReactElement;

export interface OrderRowProps { code: string; customer?: string; time?: string; staff?: string; amount: number; status?: StatusChipProps['status']; onClick?: () => void; className?: string }
export declare function OrderRow(props: OrderRowProps): React.ReactElement;

export interface ToastProps { tone?: 'success' | 'error'; children: React.ReactNode; className?: string }
export declare function Toast(props: ToastProps): React.ReactElement;

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  label: string;
  value: string | number;
  money?: boolean;
  hint?: string;
  error?: string;
  onValueChange?: (amount: number) => void;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export declare function formatVND(value: number, opts?: { sign?: boolean }): string;
export declare function parseVND(text: string): number;

declare global {
  interface Window {
    LindyOS: {
      AppBar: typeof AppBar; BottomNav: typeof BottomNav; Fab: typeof Fab; Button: typeof Button;
      SegmentedControl: typeof SegmentedControl; Money: typeof Money; SummaryCard: typeof SummaryCard;
      OrderRow: typeof OrderRow; StatusChip: typeof StatusChip; Toast: typeof Toast; TextField: typeof TextField;
      Icon: typeof Icon; formatVND: typeof formatVND; parseVND: typeof parseVND;
    };
  }
}
