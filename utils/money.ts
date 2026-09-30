export const formatINR = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
export const advanceFor = (totalPaise: number) => Math.ceil(totalPaise * 0.3);
