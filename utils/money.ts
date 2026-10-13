export const formatINR = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
