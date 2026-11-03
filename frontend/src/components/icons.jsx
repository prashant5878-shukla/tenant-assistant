const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const SendIcon = () => <svg {...base}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>;
export const UploadIcon = ({ size = 30 }) => <svg {...base} width={size} height={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>;
export const SparkIcon = () => <svg {...base}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>;
export const CheckIcon = () => <svg {...base} width={13} height={13} strokeWidth={3}><path d="m5 12 5 5L20 7" /></svg>;
export const AlertIcon = () => <svg {...base} width={13} height={13} strokeWidth={3}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>;
