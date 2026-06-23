import { ComponentType } from 'react';

// Shared type surface for the platform-split ExpirationDatePicker.
// Metro resolves the .native.tsx / .web.tsx implementations at bundle time;
// TypeScript resolves this declaration for the bare import path.
interface Props {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

declare const ExpirationDatePicker: ComponentType<Props>;
export default ExpirationDatePicker;
