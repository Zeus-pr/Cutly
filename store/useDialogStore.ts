import { create } from 'zustand';

export type DialogAction = {
  label: string;
  role?: 'cancel' | 'confirm' | 'destructive';
  onPress?: () => void;
};

type DialogState = {
  visible: boolean;
  title: string;
  message: string;
  actions: DialogAction[];
  show: (input: { title: string; message?: string; actions?: DialogAction[] }) => void;
  hide: () => void;
};

/** CUTLY-styled replacement for React Native `Alert.alert`. */
export const useDialogStore = create<DialogState>((set) => ({
  visible: false,
  title: '',
  message: '',
  actions: [],
  show: ({ title, message = '', actions }) =>
    set({
      visible: true,
      title,
      message,
      actions: actions?.length
        ? actions
        : [{ label: 'OK', role: 'confirm' }]
    }),
  hide: () => set({ visible: false })
}));

export function appAlert(title: string, message?: string, actions?: DialogAction[]) {
  useDialogStore.getState().show({ title, message, actions });
}

export function appConfirm(input: {
  title: string;
  message?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  appAlert(input.title, input.message, [
    {
      label: input.cancelLabel || 'Cancel',
      role: 'cancel',
      onPress: input.onCancel
    },
    {
      label: input.confirmLabel || 'Confirm',
      role: input.destructive ? 'destructive' : 'confirm',
      onPress: input.onConfirm
    }
  ]);
}
