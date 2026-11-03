const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const SendIcon = () => <svg {...base}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>;
export const UploadIcon = ({ size = 30 }) => <svg {...base} width={size} height={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>;
export const SparkIcon = () => <svg {...base}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>;
export const CheckIcon = () => <svg {...base} width={13} height={13} strokeWidth={3}><path d="m5 12 5 5L20 7" /></svg>;
export const AlertIcon = () => <svg {...base} width={13} height={13} strokeWidth={3}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>;
export const PlusIcon = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const ChatIcon = () => <svg {...base}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
export const FileIcon = () => <svg {...base}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>;
export const TrashIcon = () => <svg {...base} width={15} height={15}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
export const CopyIcon = () => <svg {...base} width={14} height={14}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>;
export const MenuIcon = () => <svg {...base}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
export const XIcon = () => <svg {...base} width={15} height={15}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const SearchIcon = () => <svg {...base} width={16} height={16}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
